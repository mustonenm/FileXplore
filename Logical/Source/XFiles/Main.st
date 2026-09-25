PROGRAM _INIT
	xploreFileService_0(
		Enable := FALSE,
		Reset := TRUE,
		FileDevice := 'XPlore',
		LoadServiceName := 'load-selected-Xfile',
		UploadServiceName := 'upload-Xfile');
END_PROGRAM

PROGRAM _CYCLIC
	xploreFileService_0(
		Enable := TRUE,
		Reset := FALSE,
		FileDevice := 'XPlore',
		LoadServiceName := 'load-selected-Xfile',
		UploadServiceName := 'upload-Xfile');
END_PROGRAM

PROGRAM _EXIT
	xploreFileService_0(
		Enable := FALSE,
		Reset := TRUE,
		FileDevice := 'XPlore',
		LoadServiceName := 'load-selected-Xfile',
		UploadServiceName := 'upload-Xfile');
END_PROGRAM
