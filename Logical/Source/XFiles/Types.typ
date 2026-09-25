
TYPE
	XploreUploadStep_typ : 
		(
			XPLORE_UPLOAD_IDLE := 0,
			XPLORE_UPLOAD_DELETE := 10,
			XPLORE_UPLOAD_CREATE := 20,
			XPLORE_UPLOAD_OPEN := 30,
			XPLORE_UPLOAD_WRITE := 40,
			XPLORE_UPLOAD_CLOSE := 50,
			XPLORE_UPLOAD_RESPOND := 60,
			XPLORE_UPLOAD_ERROR := 100
		);

	XploreHttpServices_typ : 	STRUCT 
		LoadServiceName : STRING[80];
		UploadServiceName : STRING[80];
		FileDevice : STRING[20];
		LoadRequestHeader : httpRequestHeader_t;
		LoadRequest : STRING[1000];
		LoadResponseHeader : httpResponseHeader_t;
		LoadResponse : STRING[1000];
		UploadRequestHeader : httpRequestHeader_t;
		UploadData : ARRAY[0..32767] OF USINT;
		UploadResponseHeader : httpResponseHeader_t;
		UploadResponse : STRING[1000];
		FileName : STRING[80];
		TransferId : STRING[80];
		UploadOffset : UDINT;
		UploadLength : UDINT;
		UploadFileSize : UDINT;
		UploadChunkIndex : UDINT;
		UploadBytesReceived : UDINT;
		UploadStep : XploreUploadStep_typ;
		FileIdent : UDINT;
		Busy : BOOL;
		Done : BOOL;
		Error : BOOL;
		LastError : UINT;
		LastErrorText : STRING[80];
		LastHttpStatus : UINT;
		LastChunkFinal : BOOL;
		Reset : BOOL;
	END_STRUCT;
END_TYPE
