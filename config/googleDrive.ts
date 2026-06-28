export const GOOGLE_DRIVE_CONFIG = {
  clientId: '321002323348-rmaaqepcjilnsj1t8505o8nj4dlh8d7e.apps.googleusercontent.com',
  clientSecret: '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',
  refreshToken: '1//04UDA6Ry8eeM4CgYIARAAGAQSNwF-L9Irnk2QTxQlrKyQgq5ucca0RoYAJJvrsN2gu3sKrCc_SkG02yjcI6U_4goMJaGbgfgwb_M',
  folderId: '11NdX10PJOfXF6r8WqgmYeznfSkmdpuW2',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  driveApiBase: 'https://www.googleapis.com/drive/v3',
  driveUploadBase: 'https://www.googleapis.com/upload/drive/v3',
}

export type DriveError =
  | 'AUTH_FAILED'
  | 'UPLOAD_FAILED'
  | 'DOWNLOAD_FAILED'
  | 'NOT_FOUND'
  | 'NETWORK_ERROR'

export interface DriveResult<T> {
  success: boolean
  data?: T
  error?: DriveError
  message?: string
}

export interface DriveFile {
  id: string
  name: string
  modifiedTime: string
}
