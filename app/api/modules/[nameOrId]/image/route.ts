import type { SlugProps } from "app/(utils)/next";
import { NotFoundError, route, storage } from "app/api/(utils)";
import * as modules from "app/api/modules";
import type { NextRequest } from "next/server";

export const GET = route(async (_req: NextRequest, { params }: SlugProps<"nameOrId">) => {
  const module = await modules.getOne(params.nameOrId);
  if (!module) throw new NotFoundError("Module not found");

  if (module.has_image) {
    return Response.redirect(storage().getImageUrl("module", module.name));
  }

  return new Response(null, { status: 204 });
});
