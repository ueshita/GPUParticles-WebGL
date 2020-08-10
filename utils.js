
async function loadShader(vertUrl, fragUrl) {
	const vertList = [];
	const fragList = [];
	const vertSource = await loadShaderFile(vertUrl, vertList);
	const fragSource = await loadShaderFile(fragUrl, fragList);

	const program = gl.createProgram();
	const vs = gl.createShader(gl.VERTEX_SHADER);
	const fs = gl.createShader(gl.FRAGMENT_SHADER);
	gl.shaderSource(vs, vertSource);
	gl.shaderSource(fs, fragSource);
	gl.compileShader(vs);
	gl.compileShader(fs);
	
	let vslog = gl.getShaderInfoLog(vs);
	if (vslog) {
		const m = vslog.match(/ERROR\: ([0-9]+)\:([0-9]+)\:/);
		if (m) vslog = vslog.replace(m[0], "ERROR: \"" + vertList[m[1]] + "\":" + m[2]);
		console.error("VertexShader: " + vslog + "File: " + vertUrl);
	}
	
	let fslog = gl.getShaderInfoLog(fs);
	if (fslog) {
		const m = fslog.match(/ERROR\: ([0-9]+)\:([0-9]+)\:/);
		if (m) fslog = fslog.replace(m[0], "ERROR: \"" + fragList[m[1]] + "\":" + m[2]);
		console.error("FragmentShader: " + fslog);
	}
	
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	const plog = gl.getProgramInfoLog(program);
	if (plog) console.error("ShaderProgram: " + plog + "File: " + vertUrl + "/" + fragUrl);
	return program;
}

async function loadShaderFile(shaderUrl, shaderList) {
	
	const shaderNumber = shaderList.length;
	const dirIndex = shaderUrl.lastIndexOf('/');
	const dirUrl = (dirIndex >= 0) ? shaderUrl.slice(0, dirIndex + 1) : "";
	shaderList.push(shaderUrl);

	const source = await loadText(shaderUrl);

	let lines = source.split(/\r\n|\r|\n/);
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(/#include \"(.*?)\"/);
		if (m) {
			lines[i] = await loadShaderFile(dirUrl + m[1], shaderList);
			lines.splice(i + 1, 0, "#line " + (i + 2) + " " + shaderNumber);
			i++;
		}
	}
	if (lines[0].indexOf("#version") >= 0) {
		lines.splice(1, 0, "#line 2 " + shaderNumber);
	} else {
		lines.splice(0, 0, "#line 1 " + shaderNumber);
	}
	return lines.join("\n");
}

async function loadText(url) {
	const a = await fetch(url);
	const b = await a.text();
	return b;
}

function createSampler(wrap, filter) {
	const sampler = gl.createSampler();
	gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, wrap);
	gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, wrap);
	gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, filter);
	gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, filter);
	return sampler;
}

function createColorTableTexture() {
	const width = 128;
	const pixels = new Uint8Array(width * 4);
	for (let x = 0; x < width; x++) {
		const rgb = hsv2rgb([x * 360 / width, 0.8, 1.0]);
		pixels[x * 4 + 0] = rgb[0];
		pixels[x * 4 + 1] = rgb[1];
		pixels[x * 4 + 2] = rgb[2];
		pixels[x * 4 + 3] = 255;
	}
	const texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
	gl.bindTexture(gl.TEXTURE_2D, null);
	return texture;
}

function hsv2rgb(hsv) {
	var h = hsv[0] / 60 ;
	var s = hsv[1] ;
	var v = hsv[2] ;
	if ( s == 0 ) return [ v * 255, v * 255, v * 255 ] ;

	var rgb ;
	var i = parseInt( h ) ;
	var f = h - i ;
	var v1 = v * (1 - s) ;
	var v2 = v * (1 - s * f) ;
	var v3 = v * (1 - s * (1 - f)) ;

	switch( i ) {
		case 0:
		case 6: rgb = [ v, v3, v1 ]; break;
		case 1: rgb = [ v2, v, v1 ]; break;
		case 2: rgb = [ v1, v, v3 ]; break;
		case 3: rgb = [ v1, v2, v ]; break;
		case 4: rgb = [ v3, v1, v ]; break;
		case 5: rgb = [ v, v1, v2 ]; break;
	}

	return rgb.map(v => v * 255);
}
