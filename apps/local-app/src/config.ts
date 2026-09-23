export const config={
  mailUrl:process.env.MAIL_MCP_URL??'http://127.0.0.1:17082/mcp',
  dbUrl:process.env.DB_MCP_URL??'http://127.0.0.1:17080/mcp',
  store:process.env.MAIL_STORE_ID??'local-mail-v1',
};
export {HttpError} from '../../../packages/contracts/src/errors.js';
