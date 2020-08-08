#version 300 es

precision highp float;
precision highp int;

#include "noise/noise2D.glsl"

//layout(location = 0) in float a_ParticleIndex;
layout(location = 0) in vec2 a_VertexPosition;

out vec4 v_Color;

uniform sampler2D Position;
uniform sampler2D Velocity;
uniform sampler2D ColorTable;
uniform ivec2 ID2TPos;

vec2 rotate(vec2 pos, float deg)
{
	const float toRad = 3.141592 / 180.0;
	float c = cos(deg * toRad);
	float s = sin(deg * toRad);
	return mat2(c, -s, s, c) * pos;
}

void main() {
	//int particleID = int(a_ParticleIndex);
	int particleID = gl_InstanceID;
	ivec2 texPos = ivec2(particleID & ID2TPos.x, particleID >> ID2TPos.y);
	vec4 position = texelFetch(Position, texPos, 0);
	vec4 velocity = texelFetch(Velocity, texPos, 0);
	if (position.w >= velocity.w) {
		gl_Position = vec4(0.0);
		v_Color = vec4(0.0);
	} else {
		//position.xyz += vec3(a_VertexPosition * 0.003, 0.0);
		position.xyz += vec3(rotate(a_VertexPosition * 0.003, 45.0), 0.0);
		gl_Position = vec4(position.xyz, 1.0);
		
		vec2 texCoord = vec2(snoise(vec2(texPos) / 512.0));
		v_Color = texture(ColorTable, texCoord);
	}
}
