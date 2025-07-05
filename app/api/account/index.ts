import { db, type User } from "app/api";
import { storage } from "app/api/(utils)";
import bcrypt from "bcrypt";

import { saveImageFile } from "../(utils)/assets";

export const verify = async (username: string, password: string): Promise<User | undefined> => {
  const user = await db.user.findFirst({
    where: {
      OR: [{ name: username }, { email: username }],
    },
  });

  if (user && bcrypt.compareSync(password, user.password)) return user;
};

// TODO: Get rid of this function?
export const saveImage = async (username: string, file: string | Blob): Promise<string> => {
  return storage.setImage("user", username, await saveImageFile(file));
};
