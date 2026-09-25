
PROGRAM _INIT
	//This should reset the services --> otherwise they could stay registered when downloading a new program
	loadHttpsService_0.enable := FALSE;
	loadHttpsService_0();
	uploadHttpsService_0.enable := FALSE;
	uploadHttpsService_0();
	
	xploreHttp.LoadServiceName := 'load-selected-Xfile';
	xploreHttp.UploadServiceName := 'upload-Xfile';
	xploreHttp.FileDevice := 'XPlore';
	xploreHttp.LoadRequestHeader.userLine[0].name := 'fileName';
	xploreHttp.UploadRequestHeader.userLine[0].name := 'fileName';
	xploreHttp.UploadRequestHeader.userLine[1].name := 'remotePath';
	xploreHttp.UploadRequestHeader.userLine[2].name := 'transferId';
	xploreHttp.UploadRequestHeader.userLine[3].name := 'chunkOffset';
	xploreHttp.UploadRequestHeader.userLine[4].name := 'chunkIndex';
	xploreHttp.UploadRequestHeader.userLine[5].name := 'fileSize';
	xploreHttp.UploadRequestHeader.userLine[6].name := 'finalChunk';
	xploreHttp.UploadStep := XPLORE_UPLOAD_IDLE;

END_PROGRAM

PROGRAM _CYCLIC
	loadHttpsService_0.enable := NOT xploreHttp.Reset;
	uploadHttpsService_0.enable := NOT xploreHttp.Reset;
		
	loadHttpsService_0(option := httpOPTION_SERVICE_TYPE_NAME, pServiceName := ADR(xploreHttp.LoadServiceName), pRequestHeader := ADR(xploreHttp.LoadRequestHeader), pRequestData := ADR(xploreHttp.LoadRequest), requestDataSize := SIZEOF(xploreHttp.LoadRequest), pResponseHeader := ADR(xploreHttp.LoadResponseHeader), pResponseData := ADR(xploreHttp.LoadResponse), responseDataLen := SIZEOF(xploreHttp.LoadResponse));
	uploadHttpsService_0(option := httpOPTION_SERVICE_TYPE_NAME, pServiceName := ADR(xploreHttp.UploadServiceName), pRequestHeader := ADR(xploreHttp.UploadRequestHeader), pRequestData := ADR(xploreHttp.UploadData), requestDataSize := SIZEOF(xploreHttp.UploadData), pResponseHeader := ADR(xploreHttp.UploadResponseHeader), pResponseData := ADR(xploreHttp.UploadResponse), responseDataLen := SIZEOF(xploreHttp.UploadResponse));

	IF loadHttpsService_0.phase = httpPHASE_RECEIVED THEN
		IF xploreHttp.LoadRequest = 'Load' THEN
			xploreHttp.LoadResponseHeader.status := '200 OK';
			xploreHttp.LoadResponseHeader.contentType := 'text/plain';
			xploreHttp.LoadResponse := 'Loading';
			xploreHttp.LoadRequest := '';
			loadHttpsService_0.send := TRUE;
		END_IF

		xploreHttp.FileName := xploreHttp.LoadRequestHeader.userLine[0].value;
	ELSE
		loadHttpsService_0.send := FALSE;
	END_IF

	IF xploreHttp.Reset THEN
		xploreHttp.UploadStep := XPLORE_UPLOAD_IDLE;
		xploreHttp.Busy := FALSE;
		xploreHttp.Done := FALSE;
		xploreHttp.Error := FALSE;
		xploreHttp.LastError := ERR_OK;
		xploreHttp.FileIdent := 0;
		uploadHttpsService_0.send := FALSE;
	ELSE
		IF (uploadHttpsService_0.phase = httpPHASE_RECEIVED) AND (xploreHttp.UploadStep = XPLORE_UPLOAD_IDLE) THEN
			xploreHttp.FileName := xploreHttp.UploadRequestHeader.userLine[0].value;
			xploreHttp.TransferId := xploreHttp.UploadRequestHeader.userLine[2].value;
			xploreHttp.UploadOffset := STRING_TO_UDINT(xploreHttp.UploadRequestHeader.userLine[3].value);
			xploreHttp.UploadChunkIndex := STRING_TO_UDINT(xploreHttp.UploadRequestHeader.userLine[4].value);
			xploreHttp.UploadFileSize := STRING_TO_UDINT(xploreHttp.UploadRequestHeader.userLine[5].value);
			xploreHttp.LastChunkFinal := xploreHttp.UploadRequestHeader.userLine[6].value = '1';
			xploreHttp.UploadLength := uploadHttpsService_0.requestDataLen;
			xploreHttp.Busy := TRUE;
			xploreHttp.Done := FALSE;
			xploreHttp.Error := FALSE;
			xploreHttp.LastError := ERR_OK;
			xploreHttp.LastErrorText := '';
			xploreHttp.LastHttpStatus := 0;
			IF uploadHttpsService_0.method <> httpMETHOD_POST THEN
				xploreHttp.LastHttpStatus := 405;
				xploreHttp.UploadStep := XPLORE_UPLOAD_ERROR;
			ELSIF xploreHttp.FileName = '' THEN
				xploreHttp.LastHttpStatus := 400;
				xploreHttp.UploadStep := XPLORE_UPLOAD_ERROR;
			ELSIF xploreHttp.UploadLength > SIZEOF(xploreHttp.UploadData) THEN
				xploreHttp.LastHttpStatus := 413;
				xploreHttp.UploadStep := XPLORE_UPLOAD_ERROR;
			ELSIF xploreHttp.UploadOffset = 0 THEN
				xploreHttp.UploadStep := XPLORE_UPLOAD_DELETE;
			ELSE
				xploreHttp.UploadStep := XPLORE_UPLOAD_OPEN;
			END_IF
		END_IF

		CASE xploreHttp.UploadStep OF
			XPLORE_UPLOAD_IDLE:
				uploadHttpsService_0.send := FALSE;

			XPLORE_UPLOAD_DELETE:
				fileDelete_0(enable := TRUE, pDevice := ADR(xploreHttp.FileDevice), pName := ADR(xploreHttp.FileName));
				IF (fileDelete_0.status = ERR_OK) OR (fileDelete_0.status = fiERR_FILE_NOT_FOUND) THEN
					fileDelete_0(enable := FALSE);
					xploreHttp.UploadStep := XPLORE_UPLOAD_CREATE;
				ELSIF fileDelete_0.status <> ERR_FUB_BUSY THEN
					xploreHttp.LastError := fileDelete_0.status;
					xploreHttp.LastErrorText := UDINT_TO_STRING(UINT_TO_UDINT(fileDelete_0.status));
					xploreHttp.LastHttpStatus := 500;
					fileDelete_0(enable := FALSE);
					xploreHttp.UploadStep := XPLORE_UPLOAD_ERROR;
				END_IF

			XPLORE_UPLOAD_CREATE:
				fileCreate_0(enable := TRUE, pDevice := ADR(xploreHttp.FileDevice), pFile := ADR(xploreHttp.FileName));
				IF fileCreate_0.status = ERR_OK THEN
					xploreHttp.FileIdent := fileCreate_0.ident;
					fileCreate_0(enable := FALSE);
					xploreHttp.UploadStep := XPLORE_UPLOAD_WRITE;
				ELSIF fileCreate_0.status <> ERR_FUB_BUSY THEN
					xploreHttp.LastError := fileCreate_0.status;
					xploreHttp.LastErrorText := UDINT_TO_STRING(UINT_TO_UDINT(fileCreate_0.status));
					xploreHttp.LastHttpStatus := 500;
					fileCreate_0(enable := FALSE);
					xploreHttp.UploadStep := XPLORE_UPLOAD_ERROR;
				END_IF

			XPLORE_UPLOAD_OPEN:
				fileOpen_0(enable := TRUE, pDevice := ADR(xploreHttp.FileDevice), pFile := ADR(xploreHttp.FileName), mode := fiREAD_WRITE);
				IF fileOpen_0.status = ERR_OK THEN
					xploreHttp.FileIdent := fileOpen_0.ident;
					fileOpen_0(enable := FALSE);
					xploreHttp.UploadStep := XPLORE_UPLOAD_WRITE;
				ELSIF fileOpen_0.status <> ERR_FUB_BUSY THEN
					xploreHttp.LastError := fileOpen_0.status;
					xploreHttp.LastErrorText := UDINT_TO_STRING(UINT_TO_UDINT(fileOpen_0.status));
					xploreHttp.LastHttpStatus := 409;
					fileOpen_0(enable := FALSE);
					xploreHttp.UploadStep := XPLORE_UPLOAD_ERROR;
				END_IF

			XPLORE_UPLOAD_WRITE:
				fileWrite_0(enable := TRUE, ident := xploreHttp.FileIdent, offset := xploreHttp.UploadOffset, pSrc := ADR(xploreHttp.UploadData), len := xploreHttp.UploadLength);
				IF fileWrite_0.status = ERR_OK THEN
					fileWrite_0(enable := FALSE);
					xploreHttp.UploadStep := XPLORE_UPLOAD_CLOSE;
				ELSIF fileWrite_0.status <> ERR_FUB_BUSY THEN
					xploreHttp.LastError := fileWrite_0.status;
					xploreHttp.LastErrorText := UDINT_TO_STRING(UINT_TO_UDINT(fileWrite_0.status));
					xploreHttp.LastHttpStatus := 500;
					fileWrite_0(enable := FALSE);
					xploreHttp.UploadStep := XPLORE_UPLOAD_CLOSE;
				END_IF

			XPLORE_UPLOAD_CLOSE:
				fileClose_0(enable := TRUE, ident := xploreHttp.FileIdent);
				IF fileClose_0.status = ERR_OK THEN
					fileClose_0(enable := FALSE);
					xploreHttp.FileIdent := 0;
					IF xploreHttp.LastError = ERR_OK THEN
						xploreHttp.UploadStep := XPLORE_UPLOAD_RESPOND;
					ELSE
						xploreHttp.UploadStep := XPLORE_UPLOAD_ERROR;
					END_IF
				ELSIF fileClose_0.status <> ERR_FUB_BUSY THEN
					xploreHttp.LastError := fileClose_0.status;
					xploreHttp.LastErrorText := UDINT_TO_STRING(UINT_TO_UDINT(fileClose_0.status));
					xploreHttp.LastHttpStatus := 500;
					fileClose_0(enable := FALSE);
					xploreHttp.FileIdent := 0;
					xploreHttp.UploadStep := XPLORE_UPLOAD_ERROR;
				END_IF

			XPLORE_UPLOAD_RESPOND:
				xploreHttp.UploadBytesReceived := xploreHttp.UploadOffset + xploreHttp.UploadLength;
				xploreHttp.UploadResponseHeader.status := '200 OK';
				xploreHttp.UploadResponseHeader.contentType := 'text/plain';
				xploreHttp.UploadResponse := 'OK';
				xploreHttp.Done := xploreHttp.LastChunkFinal;
				xploreHttp.Busy := FALSE;
				uploadHttpsService_0.send := TRUE;
				xploreHttp.UploadStep := XPLORE_UPLOAD_IDLE;

			XPLORE_UPLOAD_ERROR:
				xploreHttp.Error := TRUE;
				xploreHttp.Busy := FALSE;
				IF xploreHttp.LastHttpStatus = 0 THEN
					xploreHttp.LastHttpStatus := 500;
				END_IF
				IF xploreHttp.LastHttpStatus = 400 THEN
					xploreHttp.UploadResponseHeader.status := '400 Bad Request';
				ELSIF xploreHttp.LastHttpStatus = 405 THEN
					xploreHttp.UploadResponseHeader.status := '405 Method Not Allowed';
				ELSIF xploreHttp.LastHttpStatus = 409 THEN
					xploreHttp.UploadResponseHeader.status := '409 Conflict';
				ELSIF xploreHttp.LastHttpStatus = 413 THEN
					xploreHttp.UploadResponseHeader.status := '413 Payload Too Large';
				ELSE
					xploreHttp.UploadResponseHeader.status := '500 Internal Server Error';
				END_IF
				xploreHttp.UploadResponseHeader.contentType := 'text/plain';
				xploreHttp.UploadResponse := xploreHttp.LastErrorText;
				uploadHttpsService_0.send := TRUE;
				xploreHttp.UploadStep := XPLORE_UPLOAD_IDLE;
		END_CASE
	END_IF
	 
END_PROGRAM

PROGRAM _EXIT
	(* Insert code here *)
	 
END_PROGRAM

