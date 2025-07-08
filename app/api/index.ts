import { PrismaClient, Rank } from "app/../prisma/generated/client";
import type { Session } from "app/api";
import { storage } from "app/api/(utils)";

export interface PublicModule {
  id: string;
  owner: PublicUser;
  name: string;
  summary: string | null;
  description: string | null;
  hasImage: boolean;
  downloads: number;
  hidden?: boolean;
  tags?: string[];
  releases: PublicRelease[];
  created_at: number;
  updated_at: number;
}

export interface PublicRelease {
  id: string;
  release_version: string;
  mod_version: string;
  changelog: string | null;
  downloads: number;
  verified: boolean;
  created_at: number;
  updated_at: number;
}

export interface PublicNotification {
  title: string;
  description?: string;
  read: boolean;
  created_at: number;
}

export interface PublicUser {
  id: string;
  name: string;
  hasImage: boolean;
  rank: Rank;
  created_at: number;
}

export interface AuthenticatedUser extends PublicUser {
  email: string;
  email_verified?: boolean;
  notifications: PublicNotification[];
  last_name_change_time: Date | null;
}

export enum Sort {
  ASC = "ASC",
  DESC = "DESC",
}

const makePrismaClient = () => {
  const prisma = new PrismaClient().$extends({
    model: {
      user: {
        async getFromSession(session?: Session) {
          return session
            ? await prisma.user.findUnique({
                where: {
                  id: session.id,
                },
              })
            : undefined;
        },
      },
    },
    result: {
      module: {
        public: {
          needs: {
            id: true,
            name: true,
            user_id: true,
            summary: true,
            description: true,
            hasImage: true,
            downloads: true,
            hidden: true,
            tags: true,
            created_at: true,
            updated_at: true,
          },
          compute(module) {
            return async (session?: Session): Promise<PublicModule> => {
              const user = await db.user.findUnique({
                where: {
                  id: module.user_id,
                },
              });

              if (!user)
                throw new Error(`Unable to find user ${module.user_id} for module ${module.name}`);

              const isAuthed =
                session && (session.id === module.user_id || session.rank !== Rank.default);

              const releases = await db.release.findMany({
                where: {
                  module_id: module.id,
                },
              });

              return {
                id: module.id,
                owner: await user.public(),
                name: module.name,
                summary: module.summary,
                description: module.description,
                hasImage: module.hasImage,
                downloads: module.downloads,
                hidden: module.hidden || undefined,
                tags: module.tags && module.tags.length > 0 ? module.tags.split(",") : undefined,
                releases: releases.filter(r => isAuthed || r.verified).map(r => r.public()),
                created_at: module.created_at.getTime(),
                updated_at: module.updated_at.getTime(),
              };
            };
          },
        },
        imageDataUrl: {
          needs: {
            hasImage: true,
            name: true,
          },
          compute(module) {
            return async (): Promise<string | undefined> => {
              if (!module.hasImage) return undefined;
              return storage().getImageUrl("module", module.name);
            };
          },
        },
      },
      notification: {
        public: {
          needs: {
            title: true,
            description: true,
            read: true,
            created_at: true,
          },
          compute(notification) {
            return (): PublicNotification => ({
              title: notification.title,
              description: notification.description ?? undefined,
              read: notification.read,
              created_at: notification.created_at.getTime(),
            });
          },
        },
      },
      release: {
        public: {
          needs: {
            id: true,
            release_version: true,
            mod_version: true,
            changelog: true,
            downloads: true,
            verified: true,
            created_at: true,
            updated_at: true,
          },
          compute(release) {
            return (): PublicRelease => ({
              id: release.id,
              release_version: release.release_version,
              mod_version: release.mod_version,
              changelog: release.changelog,
              downloads: release.downloads,
              verified: release.verified,
              created_at: release.created_at.getTime(),
              updated_at: release.updated_at.getTime(),
            });
          },
        },
      },
      user: {
        public: {
          needs: {
            id: true,
            name: true,
            hasImage: true,
            rank: true,
            created_at: true,
          },
          compute(user) {
            return (): PublicUser => ({
              id: user.id,
              name: user.name,
              hasImage: user.hasImage,
              rank: user.rank,
              created_at: user.created_at.getTime(),
            });
          },
        },
        publicAuthenticated: {
          needs: {
            id: true,
            name: true,
            hasImage: true,
            rank: true,
            created_at: true,

            email: true,
            email_verified: true,
            last_name_change_time: true,
          },
          compute(user) {
            return async (): Promise<AuthenticatedUser> => ({
              id: user.id,
              name: user.name,
              hasImage: user.hasImage,
              rank: user.rank,
              created_at: user.created_at.getTime(),

              email: user.email,
              email_verified: user.email_verified,
              last_name_change_time: user.last_name_change_time,
              notifications: (
                await prisma.notification.findMany({
                  where: {
                    user_id: user.id,
                  },
                })
              ).map(n => n.public()),
            });
          },
        },
      },
    },
  });
  return prisma;
};

// biome-ignore lint/suspicious/noShadowRestrictedNames: This is the recommended workaround for NextJS given in https://www.prisma.io/docs/orm/more/help-and-troubleshooting/help-articles/nextjs-prisma-client-dev-practices
declare const globalThis: {
  prismaGlobal: ReturnType<typeof makePrismaClient>;
} & typeof global;

export const db = globalThis.prismaGlobal ?? makePrismaClient();

if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = db;

// Export types derived from makePrismaClient so they include extensions
export type Email = NonNullable<
  Awaited<ReturnType<ReturnType<typeof makePrismaClient>["email"]["findUnique"]>>
>;
export type Module = NonNullable<
  Awaited<ReturnType<ReturnType<typeof makePrismaClient>["module"]["findUnique"]>>
>;
export type Notification = NonNullable<
  Awaited<ReturnType<ReturnType<typeof makePrismaClient>["notification"]["findUnique"]>>
>;
export type Release = NonNullable<
  Awaited<ReturnType<ReturnType<typeof makePrismaClient>["release"]["findUnique"]>>
>;
export type User = NonNullable<
  Awaited<ReturnType<ReturnType<typeof makePrismaClient>["user"]["findUnique"]>>
>;

// TODO: There's probably a Prisma type somewhere that I can use instead of this
interface ModuleRelations {
  releases: Release[];
  user: User;
}

export type RelationalModule<T extends keyof ModuleRelations = never> = Module &
  Pick<ModuleRelations, T>;

// export type RelationalModule<T extends keyof Prisma.ModuleInclude | null = null> = Module &
//   ((T extends "releases" ? { releases: Release[] } : Record<PropertyKey, unknown>) &
//     (T extends "user" ? { user: User } : Record<PropertyKey, unknown>));

// export type RelationalModule<T extends keyof Prisma.ModuleInclude | null = null> = Module &
//   (T extends "releases" ? { releases: Release[] } : Record<string, never>) &
//   (T extends "user" ? { user: User } : Record<string, never>);

export type { Prisma } from "prisma-generated-client";
export { EmailType, Rank } from "prisma-generated-client";

export * from "./(utils)";
