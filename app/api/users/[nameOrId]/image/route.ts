import type { SlugProps } from "app/(utils)/next";
import { db } from "app/api";
import { route, storage } from "app/api/(utils)";
import type { NextRequest } from "next/server";

export const GET = route(async (_req: NextRequest, { params }: SlugProps<"nameOrId">) => {
  const user = await db.user.findFirst({
    where: {
      OR: [{ id: params.nameOrId }, { name: params.nameOrId }],
    },
  });
  if (!user) return new Response("User not found", { status: 404 });

  if (user.hasImage) {
    const image = await storage.getImage("user", user.name);
    if (image) {
      return new Response(image);
    }
  }

  return new Response(null, { status: 204 });
});
