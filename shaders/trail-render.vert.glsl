#version 300 es

precision highp float;
precision highp int;

#include "noise/noise2D.glsl"

layout(location = 0) in vec2 a_VertexPosition;

out vec4 v_Color;

uniform highp sampler2DArray Histories;
uniform sampler2D Position;
uniform sampler2D Velocity;
uniform sampler2D ColorTable;
uniform ivec2 Trail;
uniform ivec2 ID2TPos;

uniform mat4 ViewMatrix;
uniform mat4 ProjMatrix;

vec3 unpackVec3(float s) {
	uint bits = floatBitsToUint(s);
	vec3 v = vec3(uvec3(bits, bits >> 10, bits >> 20) & 1023u);
	return v / 1023.0 * 2.0 - 1.0;
}

void main() {
	//int particleID = int(a_ParticleIndex);
	int particleID = gl_InstanceID;
	ivec2 texPos = ivec2(particleID & ID2TPos.x, particleID >> ID2TPos.y);
	vec4 position = texelFetch(Position, texPos, 0);
	vec4 velocity = texelFetch(Velocity, texPos, 0);
	
	float age = position.w;
	if (position.w >= velocity.w || age <= 0.0) {
		gl_Position = vec4(0.0);
		v_Color = vec4(0.0);
	} else {
		float historyID = a_VertexPosition.x * min(float(Trail.y), age);
		vec3 direction;
		if (historyID >= 1.0) {
			int texIndex = (Trail.x + int(historyID) - 1) % Trail.y;
			position = texelFetch(Histories, ivec3(texPos, texIndex), 0);
			direction = unpackVec3(position.w);
		} else {
			direction = normalize(velocity.xyz);
		}
		vec3 vertex = cross(vec3(0.0, 1.0, 0.0), direction) * a_VertexPosition.y * 0.02;
		
		//float c = dot(vec3(1.0, 0.0, 0.0), direction);
		//float s = sqrt(1.0 - c * c);
		gl_Position = ProjMatrix * (ViewMatrix * vec4(position.xyz + vertex, 1.0));
		
		vec2 texCoord = vec2(snoise(vec2(texPos) / 512.0));
		v_Color = vec4(texture(ColorTable, texCoord).rgb, 0.5);
	}
}
