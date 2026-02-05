
PROGRAM _INIT
	//This should reset the service --> othervise it could "crash" when downloading new program
	httpService_0.enable := FALSE;
	httpService_0();
	
	xploreHttp.ServiceName := 'load-selected-Xfile';
	xploreHttp.RequestHeader.userLine[0].name := 'fileName';

END_PROGRAM

PROGRAM _CYCLIC
	//HTTP handshake with Node file server
	httpService_0.enable := NOT xploreHttp.Reset;
		
	httpService_0(option := httpOPTION_SERVICE_TYPE_NAME, pServiceName := ADR(xploreHttp.ServiceName), pRequestHeader := ADR(xploreHttp.RequestHeader), pRequestData := ADR(xploreHttp.Request), requestDataSize := SIZEOF(xploreHttp.Request), pResponseHeader := ADR(xploreHttp.ResponseHeader), pResponseData := ADR(xploreHttp.Response), responseDataLen := SIZEOF(xploreHttp.Response));

	IF httpService_0.phase = httpPHASE_RECEIVED THEN
		IF xploreHttp.Request = 'Load' THEN
			xploreHttp.Response := 'Loading';
			xploreHttp.Request := '';
			httpService_0.send := TRUE;
		END_IF

		//Select file name --> max 80 characters
		xploreHttp.FileName := xploreHttp.RequestHeader.userLine[0].value;
		
	ELSE
		httpService_0.send := FALSE;
	END_IF
	
	//File access via "XPlore" file device TODO
	
	
	
	 
END_PROGRAM

PROGRAM _EXIT
	(* Insert code here *)
	 
END_PROGRAM

