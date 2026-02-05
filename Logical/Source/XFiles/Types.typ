
TYPE
	XploreHttpServices_typ : 	STRUCT 
		ServiceName : STRING[80];
		RequestHeader : httpResponseHeader_t;
		Request : STRING[1000];
		ResponseHeader : httpResponseHeader_t;
		Response : STRING[1000];
		FileName : STRING[80];
		Reset : BOOL;
	END_STRUCT;
END_TYPE
