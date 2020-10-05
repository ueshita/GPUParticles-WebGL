const TrailBufferSize = 32;

class GpuParticlesBuffer {
	constructor(width, height) {
		this.sampler = createSampler(gl.CLAMP_TO_EDGE, gl.NEAREST);

		gl.getExtension("EXT_color_buffer_float");

		this.frameBuffer = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);

		this.positionTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.positionTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.positionTexture, 0);

		this.velocityTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
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
	constructor(maxParticleCount = 128 * 1024) {
		this.texWidth = TrailBufferSize;
		this.texHeight = ((maxParticleCount + this.texWidth - 1) / this.texWidth) | 0;
		this.maxParticleCount = this.texWidth * this.texHeight;
		this.pingpong = 0;
		this.particleIndex = 0;

		this.quadBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]), gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);

		this.emitBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.emitBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, 1024 * 9 * 4, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		this.emitData = new Float32Array(1024 * 9 * 4);
		this.emitedCount = 0;
		this.newParticleCount = 0;

		this.buffers = [];
		this.buffers.push(new GpuParticlesBuffer(this.texWidth, this.texHeight));
		this.buffers.push(new GpuParticlesBuffer(this.texWidth, this.texHeight));

		this.colorTableTexture = createColorTableTexture();
		this.sampler = createSampler(gl.REPEAT, gl.LINEAR);
		
		this.shaderParams = {
			ID2TPos: [this.texWidth - 1, 31 - Math.clz32(this.texWidth)],
			TPos2VPos: [2.0 / this.texWidth, 2.0 / this.texHeight, 
						1.0 / this.texWidth - 1.0, 1.0 / this.texHeight - 1.0],
			ViewMatrix: Mat4.identity(),
			ProjMatrix: Mat4.identity(),
		};

		this.trailMode = false;
		this.trailOffset = 0;
		this.trailFrameBuffer = gl.createFramebuffer();
		this.trailBufferTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.trailBufferTexture);
		gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA32F, this.texWidth, this.texHeight, TrailBufferSize, 0, gl.RGBA, gl.FLOAT, null);
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);

		const trailVertexData = new Float32Array((TrailBufferSize + 1) * 4);
		for (let i = 0; i <= TrailBufferSize; i++) {
			trailVertexData[i * 4 + 0] = +i / TrailBufferSize;
			trailVertexData[i * 4 + 1] = 0.5;
			trailVertexData[i * 4 + 2] = +i / TrailBufferSize;
			trailVertexData[i * 4 + 3] = -0.5;
		}
		this.trailVertexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.trailVertexBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, trailVertexData, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
	}

	async load() {
		this.emitShader = await loadShader("shaders/perticle-emit.vert.glsl", "shaders/perticle-emit.frag.glsl");
		this.particleUpdateShader = await loadShader("shaders/perticle-update.vert.glsl", "shaders/perticle-update.frag.glsl");
		this.particleRenderShader = await loadShader("shaders/perticle-render.vert.glsl", "shaders/perticle-render.frag.glsl");
		this.trailUpdateShader = await loadShader("shaders/trail-update.vert.glsl", "shaders/trail-update.frag.glsl");
		this.trailRenderShader = await loadShader("shaders/trail-render.vert.glsl", "shaders/trail-render.frag.glsl");
	}

	clear() {
		this.shouldClear = true;
	}

	emit(lifeTime, position, direction) {
		const index = this.newParticleCount * 9;
		this.emitData[index + 0] = (this.emitedCount + this.newParticleCount) % this.maxParticleCount;
		this.emitData[index + 1] = lifeTime;
		this.emitData[index + 2] = Math.random();
		this.emitData[index + 3] = position[0];
		this.emitData[index + 4] = position[1];
		this.emitData[index + 5] = position[2];
		this.emitData[index + 6] = direction[0];
		this.emitData[index + 7] = direction[1];
		this.emitData[index + 8] = direction[2];
		this.newParticleCount++;
		this.particleIndex++;
	}

	update() {
		const sourceIndex = this.pingpong;
		const targetIndex = (this.pingpong + 1) % 2;

		if (this.shouldClear) {
			gl.viewport(0, 0, this.texWidth, this.texHeight);
			this.buffers[sourceIndex].setUpdateTarget();
			gl.clear(gl.COLOR_BUFFER_BIT);
			this.shouldClear = false;
		}
		
		if (this.trailMode) {
			if (--this.trailOffset < 0) {
				this.trailOffset = TrailBufferSize - 1;
			}
			
			//gl.viewport(0, 0, this.texWidth, this.texHeight);
			//gl.useProgram(this.trailUpdateShader);
			//gl.bindFramebuffer(gl.FRAMEBUFFER, this.trailFrameBuffer);
			//this.buffers[sourceIndex].setUpdateSource();
			//gl.uniform1i(gl.getUniformLocation(this.trailUpdateShader, "i_ParticleData0"), 0);
			//gl.uniform1i(gl.getUniformLocation(this.trailUpdateShader, "i_ParticleData1"), 1);
			//gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.trailBufferTexture, 0, this.trailOffset);
			//gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
			//gl.enableVertexAttribArray(0);
			//gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
			//gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			//gl.disableVertexAttribArray(0);
			//gl.bindFramebuffer(gl.FRAMEBUFFER, null);

			gl.bindFramebuffer(gl.FRAMEBUFFER, this.buffers[sourceIndex].frameBuffer);
			gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.trailBufferTexture);
			gl.copyTexSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, this.trailOffset, 0, 0, this.texWidth, this.texHeight);
			gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		}
		
		gl.viewport(0, 0, this.texWidth, this.texHeight);
		gl.useProgram(this.particleUpdateShader);
		this.buffers[targetIndex].setUpdateTarget();
		this.buffers[sourceIndex].setUpdateSource();
		gl.uniform1i(gl.getUniformLocation(this.particleUpdateShader, "i_ParticleData0"), 0);
		gl.uniform1i(gl.getUniformLocation(this.particleUpdateShader, "i_ParticleData1"), 1);
		gl.uniform1f(gl.getUniformLocation(this.particleUpdateShader, "DeltaTime"), 1.0);
		
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

		Mat4.perspective(30, gl.canvas.width / gl.canvas.height, 0.1, 100, this.shaderParams.ProjMatrix);
		Mat4.lookAt([0, 2, 2], [0, 0, 0], [0, 1, 0], this.shaderParams.ViewMatrix);
	}

	_updateEmit(targetIndex) {
		if (this.newParticleCount <= 0) {
			return;
		}

		gl.bindBuffer(gl.ARRAY_BUFFER, this.emitBuffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.emitData, 0, this.newParticleCount * 9);
		
		gl.viewport(0, 0, this.texWidth, this.texHeight);
		gl.useProgram(particles.emitShader);
		this.buffers[targetIndex].setUpdateTarget();
		gl.uniform2iv(gl.getUniformLocation(this.emitShader, "ID2TPos"), this.shaderParams.ID2TPos);
		gl.uniform4fv(gl.getUniformLocation(this.emitShader, "TPos2VPos"), this.shaderParams.TPos2VPos);

		gl.enableVertexAttribArray(0);
		gl.enableVertexAttribArray(1);
		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 4 * 9, 4 * 0);
		gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 4 * 9, 4 * 3);
		gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 4 * 9, 4 * 6);
		
		gl.drawArrays(gl.POINTS, 0, this.newParticleCount);
		gl.disableVertexAttribArray(0);
		gl.disableVertexAttribArray(1);
		gl.disableVertexAttribArray(2);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);

		this.emitedCount += this.newParticleCount;
		this.emitedCount %= this.maxParticleCount;
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

		if (this.trailMode) {
			gl.useProgram(this.trailRenderShader);
			gl.uniform1i(gl.getUniformLocation(this.trailRenderShader, "ParticleData0"), 0);
			gl.uniform1i(gl.getUniformLocation(this.trailRenderShader, "ParticleData1"), 1);
			gl.uniform1i(gl.getUniformLocation(this.trailRenderShader, "ColorTable"), 2);
			gl.uniform1i(gl.getUniformLocation(this.trailRenderShader, "Histories"), 3);
			gl.uniform2i(gl.getUniformLocation(this.trailRenderShader, "Trail"), this.trailOffset, TrailBufferSize);
			gl.uniform2iv(gl.getUniformLocation(this.trailRenderShader, "ID2TPos"), this.shaderParams.ID2TPos);
			gl.uniformMatrix4fv(gl.getUniformLocation(this.trailRenderShader, "ViewMatrix"), false, this.shaderParams.ViewMatrix);
			gl.uniformMatrix4fv(gl.getUniformLocation(this.trailRenderShader, "ProjMatrix"), false, this.shaderParams.ProjMatrix);
			gl.activeTexture(gl.TEXTURE3);
			gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.trailBufferTexture);
			gl.bindSampler(3, this.buffers[this.pingpong].sampler);
			gl.activeTexture(gl.TEXTURE0);
		} else {
			gl.useProgram(this.particleRenderShader);
			gl.uniform1i(gl.getUniformLocation(this.particleRenderShader, "ParticleData0"), 0);
			gl.uniform1i(gl.getUniformLocation(this.particleRenderShader, "ParticleData1"), 1);
			gl.uniform1i(gl.getUniformLocation(this.particleRenderShader, "ColorTable"), 2);
			gl.uniform2iv(gl.getUniformLocation(this.particleRenderShader, "ID2TPos"), this.shaderParams.ID2TPos);
			gl.uniformMatrix4fv(gl.getUniformLocation(this.particleRenderShader, "ViewMatrix"), false, this.shaderParams.ViewMatrix);
			gl.uniformMatrix4fv(gl.getUniformLocation(this.particleRenderShader, "ProjMatrix"), false, this.shaderParams.ProjMatrix);
		}
		this.buffers[this.pingpong].setRenderSource();
		
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, this.colorTableTexture);
		gl.bindSampler(2, this.sampler);
		gl.activeTexture(gl.TEXTURE0);
		
		if (this.trailMode) {
			//gl.drawArraysInstanced(gl.LINE_STRIP, 0, TrailBufferSize, this.maxParticleCount);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.trailVertexBuffer);
			gl.enableVertexAttribArray(0);
			gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
			gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, TrailBufferSize * 2, this.maxParticleCount);
			gl.disableVertexAttribArray(0);
			//gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.trailIndexBuffer);
			//gl.drawElementsInstanced(gl.LINES, 2 * TrailBufferSize, gl.UNSIGNED_SHORT, 0, this.maxParticleCount);
			//gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
		} else {
			gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
			gl.enableVertexAttribArray(0);
			gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
			gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.maxParticleCount);
			gl.disableVertexAttribArray(0);
		}

		gl.disable(gl.BLEND);
	}
}
