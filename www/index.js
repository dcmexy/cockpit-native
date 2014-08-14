
var Update = {
	version: '0.0.0',
	fs: null,
	build: {},
//	server: 'http://cockpit3.localhost/',
	server: 'http://beta.cockpit.la/',
	path: 'assets/',
	remotePath: 'assets/',
	force: false,
	forward: true,
	progress: 0,
	queue: 0,
	running: false,
	isError: false,
	started: false,

	init: function() {
		getAppVersion(function(version) {
			Update.debug('Native App Version: ' + version);
			Update.version = version;
		});

		Update.start();
	},
	
	restart: function() {
		if (Update.started) {
			return;
		}
		Update.started = true;
		
		document.getElementById('status').className = 'status-retry';

		document.querySelector('.log').innerHTML = '';
		Update.debug('Native App Version: ' + Update.version);
		Update.debug('Trying again...');
		Update.queue = Update.progress = 0;

		Update.displayProgress();
		
		setTimeout(function() {
			Update.start();
		},100);
	},
	
	start: function() {

		var error = function() {
			Update.error('Failed allocating space on device.', arguments);
		};

		var success = function(fs) {
			Update.debug('Successfully allocated space on device.');
			Update.fs = fs;
			Update.checkBuild();
		};
		
		var checkAndRun = function() {
			Update.debug('Checking connection...');
			if (Update.checkConnection()) {
				Update.debug('Connection Good!');
				document.getElementById('status').className = 'status-loading';

				// start up
				Update.isError = false;
				Update.queue = Update.progress = 0;
				
				clearInterval(repeatCheck);
				Update.running = true;
				Update.started = false;
				Update.setProgress({'action': 'start'});
				window.requestFileSystem(LocalFileSystem.PERSISTENT, 0, success, error);
			} else {
				document.getElementById('status').className = 'status-connecting';
				Update.error('No connection.');
			}
		};

		var repeatCheck = setInterval(function() {
			checkAndRun();
		}, 500);
	},
	
	checkConnection: function() {
		var status = false;
		switch (navigator.connection.type) {
			case Connection.ETHERNET:
			case Connection.WIFI:
			case Connection.CELL_2G:
			case Connection.CELL_3G:
			case Connection.CELL_4G:
			case Connection.CELL:
				status = true;
				break;

			case Connection.NONE:
			case Connection.UNKNOWN:
			default:
				status = false;
				document.getElementById('status').className = 'status-connecting';
				break;		
		}
		
		return status;
	},
	
	setProgress: function(args) {
		// one config
		if (args.action == 'config') {
			Update.progress += 5;
		}

		// on digest
		if (args.action == 'digest') {
			Update.progress += 5;
		}
		
		// queue is files + 1
		if (args.action == 'file') {
			Update.progress += (1 / Update.queue) * .80 * 100;
		}
		
		if (args.action == 'complete') {
			Update.progress = 100;
		}
		
		if (Update.progress > 100) {
			Update.progress = 100;
		}
		
		Update.displayProgress();
	},
	
	displayProgress: function() {
		var colors = {
			'5': 'f63a0f',
			'25': 'f27011',
			'50': 'f2b01e',
			'75': 'f2d31b',
			'100': '86e01e'
		};
		
		var color = 'f63a0f';
	
		for (var x in colors) {
			if (Update.progress >= x) {
				color = colors[x];
			}
		}
		
		var bar = document.querySelector('.progress-bar');
		
		bar.style.width = Update.progress + '%';
		bar.style.backgroundColor = '#' + color;
	},

	read: function(entry, fn) {
		Update.debug('Reading file: ' + entry.name);
		
		var win = function(file) {
	
			var reader = new FileReader();
			reader.onloadend = function (evt) {
				Update.debug('Successfully read file: ' + entry.name);
				fn(evt.target.result);
			};
			reader.readAsText(file);
		};
		
		var fail = function() {
			Update.error('Failed to read file', arguments);
			fn(null);
		};

		entry.file(win, fail);
	},
	
	write: function(entry, data, fn) {
		var win = function(writer) {
			writer.onwrite = function(evt) {
				fn();
			};
			writer.onerror = function() {
				Update.error('Failed to write file', arguments);
			};
			writer.write(data);
		};

		var fail = function() {
			Update.error('Failed to access file', arguments);
		};

		entry.createWriter(win, fail);
	},
		
	checkBuild: function() {
		Update.currentBuild(function(build) {

			Update.read(build, function(res) {
				if (res) {
					Update.build.local = JSON.parse(res);
				}

				Update.updateBuild(function(build) {
					Update.read(build, function(res) {
						Update.build.remote = JSON.parse(res);
						
						Update.setProgress({'action': 'config'});

						if (Update.force || !Update.build.local || !Update.build.local.version || Update.build.local.version != Update.build.remote.version || Update.build.remote.force) {
							Update.update();
						} else {
							Update.complete();
						}
					});
				});
			});

		});
	},
	
	updateBuild: function(fn) {
		Update.fs.root.getFile('build.json', {create: true, exclusive: false}, function(fileEntry) {
			Update.gotFileEntry(fileEntry, 'api/build', fn);
		}, function() {
			Update.error('Failed accessing build.json for writing', arguments);
		});
	},
	
	currentBuild: function(fn) {
		Update.fs.root.getFile('build.json', {create: true, exclusive: false}, function(file) {
			fn(file);
		}, function() {
			Update.error('Failed reading current build.json', arguments);
		});
	},
	
	gotFileEntry: function(fileEntry, url, fn) {
		var fileTransfer = new FileTransfer();
		fileEntry.remove();
		fileTransfer.download(Update.server + url, fileEntry.toURL(), function(file) {
			Update.downloadComplete(file, fn);
		}, function() {
			Update.error('Failed downloading: ' + fileEntry.name, arguments);
		});
	},
	
	downloadComplete:function(file, fn) {
		Update.debug('Download complete: ' + file.name);
		fn(file);
	},
	
	debug: function(txt) {
		console.debug(arguments);
		Update.log('debug', txt);
	},
	good: function(txt) {
		console.log(arguments);
		Update.log('good', txt);
	},
	error: function(txt) {
		console.error(arguments);
		Update.log('error', txt);

		if (Update.running) {
			Update.isError = true;
			document.getElementById('status').className = 'status-error';
		}
	},
	log: function(type, txt) {
		var message = document.createElement('div');
		message.innerHTML = txt;
		message.className = type;

		var log = document.querySelector('.log');
		log.appendChild(message);
		log.scrollTop = log.scrollHeight;
	},
	
	complete: function() {
		Update.good('Update complete!');
		Update.setProgress({'action': 'complete'});
		
		Update.fs.root.getFile('cockpit.html', {create: true, exclusive: false}, function(file) {
			if (!Update.isError) {
				document.getElementById('status').className = 'status-success';

				if (Update.forward) {
					setTimeout(function() {
						location.href = file.toURL();				
					}, 100);
				}
			}
		}, function() {
			Update.error('Failed opening cokpit.phtml', arguments);
		});
	},
	
	digestIndex: function(file) {
		Update.debug('Configuring settings...');
		var complete = function() {
			Update.debug('Successfully configured');
			Update.setProgress({'action': 'digest'});
			Update.complete();
		};
		
		var replace = function(data) {
			data = data.replace(/<script src="\/\//g, '<script src="https://');
			data = data.replace(/="\/assets\/css/g, '="assets/css');
			data = data.replace(/="\/assets\/js/g, '="assets/js');
			data = data.replace(/<link href="\/\//g, '<link href="https://');

			Update.write(file, data, complete);
		};
		
		Update.read(file, function(data) {
			if (!data) {
				Update.error('Failed opening file for replacement');
			} else {
				replace(data);
			}
		});

	},

	update: function() {
		Update.debug('Updating...');
		Update.debug('Updating to version: ' + Update.build.remote.version);
		
		var forward = function(file) {
			Update.setProgress({'action': 'file'});
			Update.digestIndex(file);
		}

		var filesComplete = function() {
			Update.getFile('?_bundle=1', 'cockpit.html', forward);
		};
		
		Update.queue = Update.build.remote.files.length + 1;
		
		Update.getFiles(Update.build.remote.files, filesComplete);
	},
	
	getFiles: function(files, fn) {
		if (!files.length) {
			Update.debug('Finished downloading files.');
			fn();
			return;
		}
		var file = files.shift();
		Update.getFile(Update.remotePath + file, Update.path + file, function() {
			Update.setProgress({'action': 'file'});
			Update.getFiles(files, fn);
		});
	},
	
	getFile: function(remote, local, fn) {
		Update.debug('Downloading: ' + remote);

		local = local.replace(/^assets\/cockpit\//,'assets/');

		Update.recursiveGetFile(local, {create: true, exclusive: false}, function(fileEntry) {
			Update.gotFileEntry(fileEntry, remote, fn);
		}, function() {
			Update.error('Failed creating file: ' + local, arguments);
		});
	},
	
	recursiveGetFile: function(local, opts, success, fail) {
		var path = local.split('/');
		var used = [];
		var name = '';

		function dir(s, f) {

			used.push(path.shift());
			name = used.join('/');
			
			var suc = function(fileEntry) {
				if (!path.length) {
					success(fileEntry);
				} else {
					dir(s, f);
				}
			};

			if (path.length > 0) {
				Update.debug('Creating directory: ' + name);
				Update.fs.root.getDirectory(name, opts, suc, f);
			} else {
				Update.debug('Creating file: ' + name);
				Update.fs.root.getFile(name, opts, suc, f);
			}
		}

		dir(dir, fail);
	}
};


document.addEventListener('deviceready', Update.init, false);