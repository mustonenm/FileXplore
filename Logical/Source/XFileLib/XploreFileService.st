FUNCTION_BLOCK XploreFileService
	service.LoadServiceName := LoadServiceName;
	service.UploadServiceName := UploadServiceName;
	service.FileDevice := FileDevice;

	loadHttpsService(enable := Enable AND NOT Reset,
		option := httpOPTION_SERVICE_TYPE_NAME,
		pServiceName := ADR(service.LoadServiceName),
		pRequestHeader := ADR(service.LoadRequestHeader),
		pRequestData := ADR(service.LoadRequest),
		requestDataSize := SIZEOF(service.LoadRequest),
		pResponseHeader := ADR(service.LoadResponseHeader),
		pResponseData := ADR(service.LoadResponse),
		responseDataLen := SIZEOF(service.LoadResponse));
	uploadHttpsService(enable := Enable AND NOT Reset,
		option := httpOPTION_SERVICE_TYPE_NAME,
		pServiceName := ADR(service.UploadServiceName),
		pRequestHeader := ADR(service.UploadRequestHeader),
		pRequestData := ADR(service.UploadData),
		requestDataSize := SIZEOF(service.UploadData),
		pResponseHeader := ADR(service.UploadResponseHeader),
		pResponseData := ADR(service.UploadResponse),
		responseDataLen := SIZEOF(service.UploadResponse));

	IF service.LoadRequestHeader.userLine[0].name = '' THEN
		service.LoadRequestHeader.userLine[0].name := 'fileName';
		service.UploadRequestHeader.userLine[0].name := 'fileName';
		service.UploadRequestHeader.userLine[1].name := 'remotePath';
		service.UploadRequestHeader.userLine[2].name := 'transferId';
		service.UploadRequestHeader.userLine[3].name := 'chunkOffset';
		service.UploadRequestHeader.userLine[4].name := 'chunkIndex';
		service.UploadRequestHeader.userLine[5].name := 'fileSize';
		service.UploadRequestHeader.userLine[6].name := 'finalChunk';
	END_IF

	IF loadHttpsService.phase = httpPHASE_RECEIVED THEN
		IF service.LoadRequest = 'Load' THEN
			service.LoadResponseHeader.status := '200 OK';
			service.LoadResponseHeader.contentType := 'text/plain';
			service.LoadResponse := 'Loading';
			service.LoadRequest := '';
			loadHttpsService.send := TRUE;
		END_IF
		service.FileName := service.LoadRequestHeader.userLine[0].value;
	ELSE
		loadHttpsService.send := FALSE;
	END_IF

	IF Reset OR NOT Enable THEN
		service.UploadStep := XPLORE_UPLOAD_IDLE;
		service.Busy := FALSE;
		service.Done := FALSE;
		service.Error := FALSE;
		service.LastError := ERR_OK;
		service.FileIdent := 0;
		uploadHttpsService.send := FALSE;
	ELSE
		IF (uploadHttpsService.phase = httpPHASE_RECEIVED) AND (service.UploadStep = XPLORE_UPLOAD_IDLE) THEN
			service.FileName := service.UploadRequestHeader.userLine[0].value;
			service.TransferId := service.UploadRequestHeader.userLine[2].value;
			service.UploadOffset := STRING_TO_UDINT(service.UploadRequestHeader.userLine[3].value);
			service.UploadChunkIndex := STRING_TO_UDINT(service.UploadRequestHeader.userLine[4].value);
			service.UploadFileSize := STRING_TO_UDINT(service.UploadRequestHeader.userLine[5].value);
			service.LastChunkFinal := service.UploadRequestHeader.userLine[6].value = '1';
			service.UploadLength := uploadHttpsService.requestDataLen;
			service.Busy := TRUE;
			service.Done := FALSE;
			service.Error := FALSE;
			service.LastError := ERR_OK;
			service.LastErrorText := '';
			service.LastHttpStatus := 0;
			IF uploadHttpsService.method <> httpMETHOD_POST THEN
				service.LastHttpStatus := 405;
				service.UploadStep := XPLORE_UPLOAD_ERROR;
			ELSIF service.FileName = '' THEN
				service.LastHttpStatus := 400;
				service.UploadStep := XPLORE_UPLOAD_ERROR;
			ELSIF service.UploadLength >= SIZEOF(service.UploadData) THEN
				service.LastHttpStatus := 413;
				service.UploadStep := XPLORE_UPLOAD_ERROR;
			ELSIF service.UploadOffset = 0 THEN
				service.UploadStep := XPLORE_UPLOAD_DELETE;
			ELSE
				service.UploadStep := XPLORE_UPLOAD_OPEN;
			END_IF
		END_IF

		CASE service.UploadStep OF
			XPLORE_UPLOAD_IDLE:
				uploadHttpsService.send := FALSE;

			XPLORE_UPLOAD_DELETE:
				fileDelete(enable := TRUE, pDevice := ADR(service.FileDevice), pName := ADR(service.FileName));
				IF (fileDelete.status = ERR_OK) OR (fileDelete.status = fiERR_FILE_NOT_FOUND) THEN
					fileDelete(enable := FALSE);
					service.UploadStep := XPLORE_UPLOAD_CREATE;
				ELSIF fileDelete.status <> ERR_FUB_BUSY THEN
					service.LastError := fileDelete.status;
					service.LastErrorText := UDINT_TO_STRING(UINT_TO_UDINT(fileDelete.status));
					service.LastHttpStatus := 500;
					fileDelete(enable := FALSE);
					service.UploadStep := XPLORE_UPLOAD_ERROR;
				END_IF

			XPLORE_UPLOAD_CREATE:
				fileCreate(enable := TRUE, pDevice := ADR(service.FileDevice), pFile := ADR(service.FileName));
				IF fileCreate.status = ERR_OK THEN
					service.FileIdent := fileCreate.ident;
					fileCreate(enable := FALSE);
					service.UploadStep := XPLORE_UPLOAD_WRITE;
				ELSIF fileCreate.status <> ERR_FUB_BUSY THEN
					service.LastError := fileCreate.status;
					service.LastErrorText := UDINT_TO_STRING(UINT_TO_UDINT(fileCreate.status));
					service.LastHttpStatus := 500;
					fileCreate(enable := FALSE);
					service.UploadStep := XPLORE_UPLOAD_ERROR;
				END_IF

			XPLORE_UPLOAD_OPEN:
				fileOpen(enable := TRUE, pDevice := ADR(service.FileDevice), pFile := ADR(service.FileName), mode := fiREAD_WRITE);
				IF fileOpen.status = ERR_OK THEN
					service.FileIdent := fileOpen.ident;
					fileOpen(enable := FALSE);
					service.UploadStep := XPLORE_UPLOAD_WRITE;
				ELSIF fileOpen.status <> ERR_FUB_BUSY THEN
					service.LastError := fileOpen.status;
					service.LastErrorText := UDINT_TO_STRING(UINT_TO_UDINT(fileOpen.status));
					service.LastHttpStatus := 409;
					fileOpen(enable := FALSE);
					service.UploadStep := XPLORE_UPLOAD_ERROR;
				END_IF

			XPLORE_UPLOAD_WRITE:
				fileWrite(enable := TRUE, ident := service.FileIdent, offset := service.UploadOffset, pSrc := ADR(service.UploadData), len := service.UploadLength);
				IF fileWrite.status = ERR_OK THEN
					fileWrite(enable := FALSE);
					service.UploadStep := XPLORE_UPLOAD_CLOSE;
				ELSIF fileWrite.status <> ERR_FUB_BUSY THEN
					service.LastError := fileWrite.status;
					service.LastErrorText := UDINT_TO_STRING(UINT_TO_UDINT(fileWrite.status));
					service.LastHttpStatus := 500;
					fileWrite(enable := FALSE);
					service.UploadStep := XPLORE_UPLOAD_CLOSE;
				END_IF

			XPLORE_UPLOAD_CLOSE:
				fileClose(enable := TRUE, ident := service.FileIdent);
				IF fileClose.status = ERR_OK THEN
					fileClose(enable := FALSE);
					service.FileIdent := 0;
					IF service.LastError = ERR_OK THEN
						service.UploadStep := XPLORE_UPLOAD_RESPOND;
					ELSE
						service.UploadStep := XPLORE_UPLOAD_ERROR;
					END_IF
				ELSIF fileClose.status <> ERR_FUB_BUSY THEN
					service.LastError := fileClose.status;
					service.LastErrorText := UDINT_TO_STRING(UINT_TO_UDINT(fileClose.status));
					service.LastHttpStatus := 500;
					fileClose(enable := FALSE);
					service.FileIdent := 0;
					service.UploadStep := XPLORE_UPLOAD_ERROR;
				END_IF

			XPLORE_UPLOAD_RESPOND:
				service.UploadBytesReceived := service.UploadOffset + service.UploadLength;
				service.UploadResponseHeader.status := '200 OK';
				service.UploadResponseHeader.contentType := 'text/plain';
				service.UploadResponse := 'OK';
				service.Done := service.LastChunkFinal;
				service.Busy := FALSE;
				uploadHttpsService.send := TRUE;
				service.UploadStep := XPLORE_UPLOAD_IDLE;

			XPLORE_UPLOAD_ERROR:
				service.Error := TRUE;
				service.Busy := FALSE;
				IF service.LastHttpStatus = 0 THEN
					service.LastHttpStatus := 500;
				END_IF
				IF service.LastHttpStatus = 400 THEN
					service.UploadResponseHeader.status := '400 Bad Request';
				ELSIF service.LastHttpStatus = 405 THEN
					service.UploadResponseHeader.status := '405 Method Not Allowed';
				ELSIF service.LastHttpStatus = 409 THEN
					service.UploadResponseHeader.status := '409 Conflict';
				ELSIF service.LastHttpStatus = 413 THEN
					service.UploadResponseHeader.status := '413 Payload Too Large';
				ELSE
					service.UploadResponseHeader.status := '500 Internal Server Error';
				END_IF
				service.UploadResponseHeader.contentType := 'text/plain';
				service.UploadResponse := service.LastErrorText;
				uploadHttpsService.send := TRUE;
				service.UploadStep := XPLORE_UPLOAD_IDLE;
		END_CASE
	END_IF

	Busy := service.Busy;
	Done := service.Done;
	Error := service.Error;
	FileName := service.FileName;
	UploadBytesReceived := service.UploadBytesReceived;
	LastError := service.LastError;
	LastErrorText := service.LastErrorText;
	LastHttpStatus := service.LastHttpStatus;
END_FUNCTION_BLOCK
