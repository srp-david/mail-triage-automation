export const config = {
  database: process.env.DATABASE_URL ?? '',
  token: process.env.TRIAGE_TOKEN ?? '',
  port: Number(process.env.PORT ?? 3080),
  store: process.env.MAIL_STORE_ID ?? 'local-mail-v1',
  mailUrl: process.env.MAIL_MCP_URL ?? 'http://127.0.0.1:17082/mcp',
  dbUrl: process.env.DB_MCP_URL ?? 'http://127.0.0.1:17080/mcp',
};
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
