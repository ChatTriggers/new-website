import * as fs from "node:fs/promises";
import * as process from "node:process";
import type sharp from "sharp";

type FileWritable = Parameters<typeof fs.writeFile>[1];

interface AppStorage {
  // TODO: Not async?
  getImageUrl(type: "module" | "user", name: string): Promise<string | undefined>;
  getImage(type: "module" | "user", name: string): Promise<Buffer | undefined>;
  getReleaseFile(
    type: "scripts" | "metadata",
    moduleName: string,
    releaseId: string,
  ): Promise<Buffer>;

  // TODO: Don't share sharp.Sharp
  setImage(type: "module" | "user", name: string, file: sharp.Sharp): Promise<string>;
  setReleaseFile(
    type: "scripts" | "metadata",
    moduleName: string,
    releaseId: string,
    file: FileWritable,
  ): Promise<void>;

  deleteRelease(moduleName: string, releaseId: string): Promise<void>;

  // Used by the migration and seed scripts
  deleteEverything(): Promise<void>;
}

class FileStorage implements AppStorage {
  #directory: string;

  constructor(directory: string) {
    if (directory.endsWith("/")) {
      directory = directory.slice(0, directory.length - 1);
    }
    this.#directory = directory;
  }

  async getImageUrl(type: "module" | "user", name: string): Promise<string | undefined> {
    const dirName = type === "module" ? "modules" : "users";
    return Promise.resolve(`${this.#directory}/${dirName}/${name}/image.png`);
    // const buffer = await this.getImage(type, name);
    // if (buffer) {
    //     return `data:image/png;base64,${buffer.toString("base64")}`;
    // }
  }

  async getImage(type: "module" | "user", name: string): Promise<Buffer | undefined> {
    const dirName = type === "module" ? "modules" : "users";
    try {
      return await fs.readFile(`${this.#directory}/${dirName}/${name}/image.png`);
    } catch {
      return undefined;
    }
  }

  async getReleaseFile(
    type: "scripts" | "metadata",
    moduleName: string,
    releaseId: string,
  ): Promise<Buffer> {
    const fileName = type === "scripts" ? "scripts.zip" : "metadata.json";
    return await fs.readFile(`${this.#directory}/modules/${moduleName}/${releaseId}/${fileName}`);
  }

  async setImage(type: "module" | "user", name: string, file: sharp.Sharp): Promise<string> {
    const dirName = type === "module" ? "modules" : "users";
    await fs.mkdir(`${this.#directory}/${dirName}/${name}`, { recursive: true });
    const path = `${this.#directory}/${dirName}/${name}/image.png`;
    file.toFile(path);
    return path;
  }

  async setReleaseFile(
    type: "scripts" | "metadata",
    moduleName: string,
    releaseId: string,
    file: FileWritable,
  ): Promise<void> {
    const releaseFolder = `${this.#directory}/modules/${moduleName}/${releaseId}`;
    await fs.mkdir(releaseFolder, { recursive: true });
    const fileName = type === "scripts" ? "scripts.zip" : "metadata.json";
    await fs.writeFile(`${releaseFolder}/${fileName}`, file);
  }

  async deleteRelease(moduleName: string, releaseId: string): Promise<void> {
    const releaseFolder = `${this.#directory}/modules/${moduleName}/${releaseId}`;
    await fs.rm(releaseFolder, { recursive: true });
  }

  async deleteEverything(): Promise<void> {
    await fs.rm(this.#directory, { recursive: true });
    await fs.mkdir(this.#directory, { recursive: true });
  }
}

class S3Storage implements AppStorage {
  constructor(_bucketUrl: string) {}

  async getImageUrl(_type: "module" | "user", _name: string): Promise<string | undefined> {
    throw new Error("TODO");
  }

  async getImage(_type: "module" | "user", _name: string): Promise<Buffer | undefined> {
    throw new Error("TODO");
  }

  async getReleaseFile(
    _type: "scripts" | "metadata",
    _moduleName: string,
    _releaseId: string,
  ): Promise<Buffer> {
    throw new Error("TODO");
  }

  async setImage(_type: "module" | "user", _name: string, _file: sharp.Sharp): Promise<string> {
    throw new Error("TODO");
  }

  async setReleaseFile(
    _type: "scripts" | "metadata",
    _moduleName: string,
    _releaseId: string,
    _file: FileWritable,
  ): Promise<void> {
    throw new Error("TODO");
  }

  async deleteRelease(_moduleName: string, _releaseId: string): Promise<void> {
    throw new Error("TODO");
  }

  async deleteEverything(): Promise<void> {
    throw new Error("TODO");
  }
}

export function createStorageFromEnv(
  s3EnvVar: string | undefined,
  localStorageEnvVar: string | undefined,
): AppStorage {
  const s3 = s3EnvVar && process.env[s3EnvVar];
  const localStorage = localStorageEnvVar && process.env[localStorageEnvVar];

  if (s3 && localStorage) {
    throw new Error(
      `Cannot specify both ${s3EnvVar} and ${localStorageEnvVar} environment variables`,
    );
  }

  if (s3) {
    return new S3Storage(s3);
  }

  if (localStorage) {
    return new FileStorage(localStorage);
  }

  throw new Error(`Must specify one of ${s3EnvVar} or ${localStorageEnvVar}`);
}

export const storage: AppStorage = createStorageFromEnv("STORAGE_S3_BUCKET", "STORAGE_LOCAL_DIR");
