import { EmbedBuilder } from "@discordjs/builders";
import { storage, type Module, type RelationalModule, type Release } from "app/api";
import { WebhookClient } from "discord.js";

let announceClient: WebhookClient | null = null;
let verifyClient: WebhookClient | null = null;

const getAnnounceClient = () => {
  if (!announceClient && process.env.DISCORD_ANNOUNCE_CHANNEL_WEBHOOK) {
    announceClient = new WebhookClient({
      url: process.env.DISCORD_ANNOUNCE_CHANNEL_WEBHOOK,
    });
  }
  return announceClient;
};

const getVerifyClient = () => {
  if (!verifyClient && process.env.DISCORD_VERIFY_CHANNEL_WEBHOOK) {
    verifyClient = new WebhookClient({
      url: process.env.DISCORD_VERIFY_CHANNEL_WEBHOOK,
    });
  }
  return verifyClient;
};

export const onModuleCreated = async (module: RelationalModule<"user">) => {
  const embed = new EmbedBuilder()
    .setTitle(`Module created: ${module.name}`)
    .setURL(`${process.env.NEXT_PUBLIC_WEB_ROOT}/modules/${module.name}`)
    .setColor(0x7b2fb5)
    .setTimestamp(Date.now())
    .addFields({ name: "Author", value: module.user.name, inline: true });

  if (module.summary) embed.addFields({ name: "Summary", value: module.summary });

  if (module.hasImage) {
    embed.setImage(`${process.env.NEXT_PUBLIC_WEB_ROOT}/api/modules/${module.name}/image`);
  }

  const client = getAnnounceClient();
  if (client) {
    client.send({
      username: "ctbot",
      avatarURL: `${process.env.NEXT_PUBLIC_WEB_ROOT}/favicon.ico`,
      embeds: [embed],
    });
  }
};

export const onModuleDeleted = async (module: Module) => {
  const embed = new EmbedBuilder()
    .setTitle(`Module deleted: ${module.name}`)
    .setColor(0x7b2fb5)
    .setTimestamp(Date.now());

  const client = getAnnounceClient();
  if (client) {
    client.send({
      username: "ctbot",
      avatarURL: `${process.env.NEXT_PUBLIC_WEB_ROOT}/favicon.ico`,
      embeds: [embed],
    });
  }
};

export const onReleaseCreated = async (module: RelationalModule<"user">, release: Release) => {
  const embed = new EmbedBuilder()
    .setTitle(`Release v${release.release_version} created for module: ${module.name}`)
    .setURL(`${process.env.NEXT_PUBLIC_WEB_ROOT}/modules/${module.name}`)
    .setColor(0x7b2fb5)
    .setTimestamp(Date.now())
    .addFields(
      { name: "Author", value: module.user.name, inline: true },
      { name: "Release Version", value: release.release_version, inline: true },
      { name: "Mod Version", value: release.mod_version, inline: true },
    );

  if (release.changelog) {
    const changelog =
      release.changelog.length > 600
        ? `${release.changelog.substring(0, 597)}...`
        : release.changelog;
    embed.addFields({ name: "Changelog", value: changelog });
  }

  const client = getAnnounceClient();
  if (client) {
    client.send({
      username: "ctbot",
      avatarURL: `${process.env.NEXT_PUBLIC_WEB_ROOT}/favicon.ico`,
      embeds: [embed],
    });
  }
};

export const onReleaseNeedsToBeVerified = async (module: Module, release: Release) => {
  const url = `${process.env.NEXT_PUBLIC_WEB_ROOT}/modules/${module.name}/releases/${release.id}/verify`;

  const embed = new EmbedBuilder()
    .setTitle(`Release v${release.release_version} for module ${module.name} has been posted`)
    .setDescription(
      `Please verify this release is safe and non-malicious.\nClick [here](${url}) to confirm verification`,
    )
    .setColor(0x3cc5c5)
    .setTimestamp(Date.now());

  const client = getVerifyClient();
  if (client) {
    const response = await client.send({
      username: "ctbot",
      avatarURL: `${process.env.NEXT_PUBLIC_WEB_ROOT}/favicon.ico`,
      embeds: [embed],
    });
    release.verification_message_id = response.id;
  }
};

export const deleteReleaseVerificationMessage = async (release: Release) => {
  const client = getVerifyClient();
  if (client && release.verification_message_id) {
    await client.deleteMessage(release.verification_message_id);
  }
};
