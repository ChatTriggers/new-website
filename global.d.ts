namespace NodeJS {
  interface ProcessEnv {
    // Required
    DATABASE_URL: string;
    NEXT_PUBLIC_WEB_ROOT: string;
    JWT_SECRET: string;
    JWT_COOKIE_NAME: string;

    // Optional
    STORAGE_LOCAL_DIR?: string;
    AWS_ACCESS_KEY_ID?: string;
    AWS_SECRET_ACCESS_KEY?: string;
    AWS_S3_REGION?: string;
    AWS_S3_BUCKET_NAME?: string;
    OLD_DATABASE_URL?: string;
    DISCORD_ANNOUNCE_CHANNEL_WEBHOOK: string;
    DISCORD_VERIFY_CHANNEL_WEBHOOK: string;
    MAILERSEND_API_KEY?: string;
    MAILERSEND_DOMAIN_ID?: string;
    MAILERSEND_VERIFICATION_TEMPLATE_ID?: string;
    MAILERSEND_PASSWORD_RESET_TEMPLATE_ID?: string;
    NEXT_PUBLIC_IGNORE_EMAIL_VERIFICATION?: string;
    GITHUB_TOKEN?: string;
    OLD_STORAGE_LOCAL_DIR?: string;
  }
}
