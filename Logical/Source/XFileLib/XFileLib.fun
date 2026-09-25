
{REDUND_ERROR} {REDUND_UNREPLICABLE} FUNCTION_BLOCK XploreFileService (*Xplore file service*) (*$GROUP=User,$CAT=User,$GROUPICON=User.png,$CATICON=User.png*)
	VAR_INPUT
		Enable : {REDUND_UNREPLICABLE} BOOL;
		Reset : {REDUND_UNREPLICABLE} BOOL;
		FileDevice : {REDUND_UNREPLICABLE} STRING[20];
		LoadServiceName : {REDUND_UNREPLICABLE} STRING[80];
		UploadServiceName : {REDUND_UNREPLICABLE} STRING[80];
	END_VAR
	VAR_OUTPUT
		Busy : {REDUND_UNREPLICABLE} BOOL;
		Done : {REDUND_UNREPLICABLE} BOOL;
		Error : {REDUND_UNREPLICABLE} BOOL;
		FileName : {REDUND_UNREPLICABLE} STRING[80];
		UploadBytesReceived : {REDUND_UNREPLICABLE} UDINT;
		LastError : {REDUND_UNREPLICABLE} UINT;
		LastErrorText : {REDUND_UNREPLICABLE} STRING[80];
		LastHttpStatus : {REDUND_UNREPLICABLE} UINT;
	END_VAR
	VAR
		loadHttpsService : {REDUND_UNREPLICABLE} httpsService;
		uploadHttpsService : {REDUND_UNREPLICABLE} httpsService;
		fileDelete : {REDUND_UNREPLICABLE} FileDelete;
		fileCreate : {REDUND_UNREPLICABLE} FileCreate;
		fileOpen : {REDUND_UNREPLICABLE} FileOpen;
		fileWrite : {REDUND_UNREPLICABLE} FileWrite;
		fileClose : {REDUND_UNREPLICABLE} FileClose;
		service : {REDUND_UNREPLICABLE} XploreHttpServices_typ;
	END_VAR
END_FUNCTION_BLOCK
