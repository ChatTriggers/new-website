import * as fs from "node:fs/promises";
import * as process from "node:process";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type sharp from "sharp";

type ImageType = "module-image" | "module-icon" | "user";
type FileType = "scripts" | "metadata";

interface AppStorage {
  getImageUrl(type: ImageType, name: string): string | undefined;
  getImage(type: ImageType, name: string): Promise<Buffer | undefined>;
  getReleaseFile(type: FileType, moduleName: string, releaseId: string): Promise<Buffer>;

  // TODO: Don't share sharp.Sharp
  setImage(type: ImageType, name: string, file: sharp.Sharp): Promise<void>;
  setReleaseFile(
    type: FileType,
    moduleName: string,
    releaseId: string,
    file: Buffer,
  ): Promise<void>;

  deleteRelease(moduleName: string, releaseId: string): Promise<void>;

  // Used by the migration and seed scripts
  deleteEverything(): Promise<void>;
}

export class FileStorage implements AppStorage {
  #directory: string;

  static fromEnv(envVar: string) {
    if (!process.env[envVar]) throw new Error(`Environment variable ${envVar} not found`);
    return new FileStorage(process.env[envVar]);
  }

  constructor(directory: string) {
    if (directory.endsWith("/")) {
      directory = directory.slice(0, directory.length - 1);
    }
    this.#directory = directory;
  }

  getImageUrl(type: ImageType, name: string): string | undefined {
    // No external URL
    return undefined;
  }

  async getImage(type: ImageType, name: string): Promise<Buffer | undefined> {
    try {
      const dirName = type === "user" ? "users" : "modules";
      const fileName = type === "module-icon" ? "icon.png" : "image.png";
      return await fs.readFile(`${this.#directory}/${dirName}/${name.toLowerCase()}/${fileName}`);
    } catch {
      return undefined;
    }
  }

  async getReleaseFile(type: FileType, moduleName: string, releaseId: string): Promise<Buffer> {
    const fileName = type === "scripts" ? "scripts.zip" : "metadata.json";
    return await fs.readFile(
      `${this.#directory}/modules/${moduleName.toLowerCase()}/${releaseId}/${fileName}`,
    );
  }

  async setImage(type: ImageType, name: string, file: sharp.Sharp): Promise<void> {
    name = name.toLowerCase();
    const dirName = type === "user" ? "users" : "modules";
    const fileName = type === "module-icon" ? "icon.png" : "image.png";
    await fs.mkdir(`${this.#directory}/${dirName}/${name}`, { recursive: true });
    file.toFile(`${this.#directory}/${dirName}/${name}/${fileName}`);
  }

  async setReleaseFile(
    type: FileType,
    moduleName: string,
    releaseId: string,
    file: Buffer,
  ): Promise<void> {
    const releaseFolder = `${this.#directory}/modules/${moduleName.toLowerCase()}/${releaseId}`;
    await fs.mkdir(releaseFolder, { recursive: true });
    const fileName = type === "scripts" ? "scripts.zip" : "metadata.json";
    await fs.writeFile(`${releaseFolder}/${fileName}`, new Uint8Array(file));
  }

  async deleteRelease(moduleName: string, releaseId: string): Promise<void> {
    const releaseFolder = `${this.#directory}/modules/${moduleName.toLowerCase()}/${releaseId}`;
    await fs.rm(releaseFolder, { recursive: true });
  }

  async deleteEverything(): Promise<void> {
    await fs.rm(this.#directory, { recursive: true });
    await fs.mkdir(this.#directory, { recursive: true });
  }
}

export class S3Storage implements AppStorage {
  #client: S3Client;
  #bucketName: string;

  static fromEnv(): S3Storage {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_S3_REGION;
    const bucketName = process.env.AWS_S3_BUCKET_NAME;

    if (!accessKeyId) throw new Error(`Missing environment variable AWS_ACCESS_KEY_ID`);
    if (!secretAccessKey) throw new Error(`Missing environment variable AWS_SECRET_ACCESS_KEY`);
    if (!region) throw new Error(`Missing environment variable AWS_S3_REGION`);
    if (!bucketName) throw new Error(`Missing environment variable AWS_S3_BUCKET_NAME`);

    return new S3Storage(accessKeyId, secretAccessKey, region, bucketName);
  }

  constructor(accessKeyId: string, secretAccessKey: string, region: string, bucketName: string) {
    this.#client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    this.#bucketName = bucketName;
  }

  getImageUrl(type: ImageType, name: string): string {
    const dirName = type === "user" ? "users" : "modules";
    const fileName = type === "module-icon" ? "icon.png" : "image.png";
    return `https://${this.#bucketName}.s3.amazonaws.com//public/${dirName}/${name.toLowerCase()}/${fileName}`;
  }

  async getImage(type: ImageType, name: string): Promise<Buffer | undefined> {
    const dirName = type === "user" ? "users" : "modules";
    const fileName = type === "module-icon" ? "icon.png" : "image.png";

    const response = await this.#client.send(
      new GetObjectCommand({
        Bucket: this.#bucketName,
        Key: `/public/${dirName}/${name.toLowerCase()}/${fileName}`,
      }),
    );

    if (!response.Body) {
      return;
    }

    return Buffer.from(await response.Body.transformToByteArray());
  }

  async getReleaseFile(
    type: "scripts" | "metadata",
    moduleName: string,
    releaseId: string,
  ): Promise<Buffer> {
    const fileName = type === "scripts" ? "scripts.zip" : "metadata.json";
    const response = await this.#client.send(
      new GetObjectCommand({
        Bucket: this.#bucketName,
        Key: `/public/modules/${moduleName.toLowerCase()}/${releaseId}/${fileName}`,
      }),
    );

    if (response.$metadata.httpStatusCode !== 200 || !response.Body) {
      throw new Error(`Failed to find ${type} file for ${moduleName}/${releaseId}`);
    }

    return Buffer.from(await response.Body.transformToByteArray());
  }

  async setImage(type: ImageType, name: string, file: sharp.Sharp): Promise<void> {
    const dirName = type === "user" ? "users" : "modules";
    const fileName = type === "module-icon" ? "icon.png" : "image.png";

    const response = await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucketName,
        Key: `/public/${dirName}/${name.toLowerCase()}/${fileName}`,
        Body: await file.toBuffer(),
        ACL: "public-read",
      }),
    );

    if (response.$metadata.httpStatusCode !== 200) {
      throw new Error(`Failed to set image for ${type} ${name}`);
    }
  }

  async setReleaseFile(
    type: "scripts" | "metadata",
    moduleName: string,
    releaseId: string,
    file: Buffer,
  ): Promise<void> {
    const fileName = type === "scripts" ? "scripts.zip" : "metadata.json";
    const response = await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucketName,
        Key: `/public/modules/${moduleName.toLowerCase()}/${releaseId}/${fileName}`,
        Body: file,
      }),
    );

    if (response.$metadata.httpStatusCode !== 200) {
      throw new Error(`Failed to set file ${fileName} for ${moduleName}/${releaseId}`);
    }
  }

  async deleteRelease(moduleName: string, releaseId: string): Promise<void> {
    const response = await this.#client.send(
      new DeleteObjectCommand({
        Bucket: this.#bucketName,
        Key: `/public/modules/${moduleName.toLowerCase()}/${releaseId}`,
      }),
    );

    if (response.$metadata.httpStatusCode !== 200) {
      throw new Error(`Failed to delete ${moduleName}/${releaseId}`);
    }
  }

  async deleteEverything(): Promise<void> {
    let continuationToken: string | undefined;
    do {
      const objects = await this.#client.send(
        new ListObjectsV2Command({
          Bucket: this.#bucketName,
          Prefix: "/public/",
          ContinuationToken: continuationToken,
        }),
      );

      if (!objects.Contents || objects.Contents.length === 0) {
        break;
      }

      const deleteResult = await this.#client.send(
        new DeleteObjectsCommand({
          Bucket: this.#bucketName,
          Delete: {
            Objects: objects.Contents.map(obj => ({ Key: obj.Key })),
          },
        }),
      );

      if (deleteResult.$metadata.httpStatusCode !== 200) {
        throw new Error("Failed to delete everything");
      }

      continuationToken = objects.IsTruncated ? objects.NextContinuationToken : undefined;
    } while (continuationToken);
  }
}

let _storage: AppStorage | undefined;

export function storage(localStorageEnvVar: string = "STORAGE_LOCAL_DIR"): AppStorage {
  if (!_storage) {
    _storage = (() => {
      try {
        return FileStorage.fromEnv(localStorageEnvVar);
      } catch {}

      try {
        return S3Storage.fromEnv();
      } catch {}

      throw new Error(`Must specify ${localStorageEnvVar} or AWS environment variables`);
    })();
  }

  return _storage;
}
