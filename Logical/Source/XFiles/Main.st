PROGRAM _INIT
	xploreFileService_0(
		Enable := FALSE,
		Reset := TRUE,
		FileDevice := 'XPlore',
		LoadServiceName := 'load-selected-Xfile',
		UploadServiceName := 'upload-Xfile');

		cpuSimulated := DiagCpuIsARsim();
END_PROGRAM

PROGRAM _CYCLIC
	xploreFileService_0(
		Enable := TRUE,
		Reset := FALSE,
		FileDevice := 'XPlore',
		LoadServiceName := 'load-selected-Xfile',
		UploadServiceName := 'upload-Xfile');

		IF cpuSimulated THEN
			gHostIP := '127.0.0.1'; //Simulation active
		ELSE
			gHostIP := '192.168.3.100'; //Real target
		END_IF

END_PROGRAM

PROGRAM _EXIT
	xploreFileService_0(
		Enable := FALSE,
		Reset := TRUE,
		FileDevice := 'XPlore',
		LoadServiceName := 'load-selected-Xfile',
		UploadServiceName := 'upload-Xfile');
END_PROGRAM
