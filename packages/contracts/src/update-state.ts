export interface UpdateOffer {
  releaseId:string;version:string;assetSha256:string;releaseNotesUrl:string;
}
export interface UpdateState {
  currentVersion:string;
  status:'unknown'|'current'|'offered'|'unavailable'|'channel_denied'|'login_required'|'error';
  phase:'idle'|'checking'|'downloading'|'verifying'|'waiting'|'installing'|'error';
  lastCheckedAt?:string;
  errorCode?:string;
  downloadedBytes?:number;
  totalBytes?:number;
  update?:UpdateOffer;
  deferred?:boolean;
}
