import type { SlugProps } from "app/(utils)/next";
import { db, getSessionFromCookies, Rank } from "app/api";
import * as modules from "app/api/modules";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import VerifyComponent from "./VerifyComponent";

export default async function Page({ params }: SlugProps<"nameOrId" | "releaseId">) {
  const session = getSessionFromCookies(cookies());
  if (!session || session.rank === Rank.default) notFound();

  const { nameOrId, releaseId } = params;

  const module = (await modules.getOne(nameOrId)) ?? notFound();
  const release = module.releases.find(r => r.id === releaseId) ?? notFound();

  const oldRelease = (
    await db.release.findFirst({
      where: {
        module: {
          id: module.id,
        },
        verified: false,
      },
      orderBy: {
        release_version: "desc",
      },
    })
  )?.public();

  return (
    <VerifyComponent
      module={await module.public()}
      release={release.public()}
      oldRelease={oldRelease}
    />
  );
}
