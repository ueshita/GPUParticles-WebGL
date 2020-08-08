
window.addEventListener("load", () => {
	init();
});

const canvas = document.getElementById("main");
canvas.addEventListener("mousemove", (e) => {
	targetX = e.clientX;
	targetY = e.clientY;
});
let targetX = canvas.width / 2;
let targetY = canvas.height / 2;
let currentX = canvas.width / 2;
let currentY = canvas.height / 2;

/** @type {WebGL2RenderingContext} */
const gl = canvas.getContext("webgl2");
console.log(gl.getSupportedExtensions());

const BufferTexSize = 512;
const BufferTexels = BufferTexSize * BufferTexSize;

class GpuParticlesBuffer {
	constructor() {
		this.sampler = createSampler(gl.CLAMP_TO_EDGE, gl.NEAREST);

		gl.getExtension("EXT_color_buffer_float");

		this.frameBuffer = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);

		this.positionTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.positionTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, BufferTexSize, BufferTexSize, 0, gl.RGBA, gl.FLOAT, null);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.positionTexture, 0);

		this.velocityTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, BufferTexSize, BufferTexSize, 0, gl.RGBA, gl.FLOAT, null);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.velocityTexture, 0);

		//console.log(gl.checkFramebufferStatus(gl.FRAMEBUFFER), gl.FRAMEBUFFER_COMPLETE);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}
	setUpdateTarget() {
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);
		gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
	}
	setUpdateSource() {
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.positionTexture);
		gl.bindSampler(0, this.sampler);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture);
		gl.bindSampler(1, this.sampler);
		gl.activeTexture(gl.TEXTURE0);
	}
	setRenderSource() {
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.positionTexture);
		gl.bindSampler(0, this.sampler);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture);
		gl.bindSampler(1, this.sampler);
		gl.activeTexture(gl.TEXTURE0);
	}
}

class GpuParticlesContext {

	constructor() {
		this.pingpong = 0;

		this.quadBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]), gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);

		this.emitBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.emitBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, 1024 * 8 * 4, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		this.emitData = new Float32Array(1024 * 8 * 4);
		this.emitedCount = 0;
		this.newParticleCount = 0;

		this.buffers = [];
		this.buffers.push(new GpuParticlesBuffer());
		this.buffers.push(new GpuParticlesBuffer());

		this.colorTableTexture = createColorTableTexture();
		this.sampler = createSampler(gl.REPEAT, gl.LINEAR);
		
		this.shaderParams = {
			ID2TPos: [BufferTexSize - 1, 31 - Math.clz32(BufferTexSize)],
			TPos2VPos: [2.0 / BufferTexSize, 1.0 / BufferTexSize - 1.0],
		};
	}

	async load() {
		this.renderShader = await loadShader("perticle-render.vert.glsl", "perticle-render.frag.glsl");
		this.emitShader = await loadShader("perticle-emit.vert.glsl", "perticle-emit.frag.glsl");
		this.updateShader = await loadShader("perticle-update.vert.glsl", "perticle-update.frag.glsl");
	}

	emit(lifeTime, position, velocity) {
		const index = this.newParticleCount * 8;
		this.emitData[index + 0] = (this.emitedCount + this.newParticleCount) % BufferTexels;
		this.emitData[index + 1] = lifeTime;
		this.emitData[index + 2] = position[0];
		this.emitData[index + 3] = position[1];
		this.emitData[index + 4] = position[2];
		this.emitData[index + 5] = velocity[0];
		this.emitData[index + 6] = velocity[1];
		this.emitData[index + 7] = velocity[2];
		this.newParticleCount++;
	}

	update() {
		const sourceIndex = this.pingpong;
		const targetIndex = (this.pingpong + 1) % 2;
		
		this.buffers[targetIndex].setUpdateTarget();
		gl.viewport(0, 0, BufferTexSize, BufferTexSize);
		gl.useProgram(this.updateShader);
		this.buffers[sourceIndex].setUpdateSource();
		gl.uniform1i(gl.getUniformLocation(this.updateShader, "i_Position"), 0);
		gl.uniform1i(gl.getUniformLocation(this.updateShader, "i_Velocity"), 1);
		gl.uniform1f(gl.getUniformLocation(this.updateShader, "deltaTime"), 1.0);
		
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		gl.disableVertexAttribArray(0);

		this._updateEmit(targetIndex);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);

		if (++this.pingpong >= 2) {
			this.pingpong = 0;
		}
	}

	_updateEmit(targetIndex) {
		if (this.newParticleCount <= 0) {
			return;
		}

		gl.bindBuffer(gl.ARRAY_BUFFER, this.emitBuffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.emitData, 0, this.newParticleCount * 8);
		
		this.buffers[targetIndex].setUpdateTarget();
		gl.viewport(0, 0, BufferTexSize, BufferTexSize);

		gl.useProgram(particles.emitShader);
		gl.uniform2iv(gl.getUniformLocation(this.emitShader, "ID2TPos"), this.shaderParams.ID2TPos);
		gl.uniform2fv(gl.getUniformLocation(this.emitShader, "TPos2VPos"), this.shaderParams.TPos2VPos);

		gl.enableVertexAttribArray(0);
		gl.enableVertexAttribArray(1);
		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 4 * 8, 4 * 0);
		gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 4 * 8, 4 * 2);
		gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 4 * 8, 4 * 5);
		
		gl.drawArrays(gl.POINTS, 0, this.newParticleCount);
		gl.disableVertexAttribArray(0);
		gl.disableVertexAttribArray(1);
		gl.disableVertexAttribArray(2);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);

		this.emitedCount += this.newParticleCount;
		this.emitedCount %= BufferTexels;
		this.newParticleCount = 0;
		
		//gl.readBuffer(gl.COLOR_ATTACHMENT1);
		//const pixels = new Float32Array(3 * 4);
		//gl.readPixels(0, 0, 3, 1, gl.RGBA, gl.FLOAT, pixels);
		//console.log(pixels);
	}

	render() {
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

		gl.useProgram(particles.renderShader);
		//gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
		this.buffers[this.pingpong].setRenderSource();
		gl.uniform1i(gl.getUniformLocation(this.renderShader, "Position"), 0);
		gl.uniform1i(gl.getUniformLocation(this.renderShader, "Velocity"), 1);
		gl.uniform1i(gl.getUniformLocation(this.renderShader, "ColorTable"), 2);
		gl.uniform2iv(gl.getUniformLocation(this.renderShader, "ID2TPos"), this.shaderParams.ID2TPos);
		
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, this.colorTableTexture);
		gl.bindSampler(2, this.sampler);
		gl.activeTexture(gl.TEXTURE0);


		gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, BufferTexels);
		gl.disableVertexAttribArray(0);
		
		gl.disable(gl.BLEND);
	}
}

const particles = new GpuParticlesContext();

async function init() {
	await particles.load();

	//particles.emit([0.0, 0.5, 0.0], [0.0, -0.01, 0.0]);
	//particles.emit([-0.5, -0.5, 0.0], [0.01, 0.01, 0.0]);
	//particles.emit([0.5, -0.5, 0.0], [-0.01, 0.01, 0.0]);

	requestAnimationFrame(updateFrame);
}

function updateFrame() {
	const startX = currentX;
	const startY = currentY;
	currentX += (targetX - currentX) * 0.2;
	currentY += (targetY - currentY) * 0.2;

	const emitCount = 100;
	for (let i = 0; i < emitCount; i++) {
		const lifetime = 60 + Math.random() * 100;
		const rad = Math.random() * 3.141592 * 2.0;
		const s = Math.sin(rad);
		const c = Math.cos(rad);
		const speed = 0.002 + Math.random() * 0.005;

		const mx = startX + (currentX - startX) * i / emitCount;
		const my = startY + (currentY - startY) * i / emitCount;
		const x = mx / canvas.width  * 2 - 1;
		const y = 1 - my / canvas.height * 2;
		particles.emit(lifetime, [x, y, 0.0], [c * speed, s * speed, 0.0]);
	}
	particles.update();

	gl.clearColor(0, 0, 0, 1);
	gl.clear(gl.COLOR_BUFFER_BIT);

	particles.render();

	requestAnimationFrame(updateFrame);
}

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
