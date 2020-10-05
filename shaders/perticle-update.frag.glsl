#version 300 es

precision highp float;
precision highp int;

#include "utils.glsl"

uniform sampler2D i_ParticleData0; // |   Pos X   |   Pos Y   |   Pos Z   |  Dir XYZ  |
uniform sampler2D i_ParticleData1; // | LifeCount | Lifetime  |   Index   |   Seed    |
uniform float DeltaTime;
uniform bvec4 Flags;

layout(location = 0) out vec4 o_ParticleData0; // |   Pos X   |   Pos Y   |   Pos Z   |  Dir XYZ  |
layout(location = 1) out vec4 o_ParticleData1; // | LifeCount | Lifetime  |   Index   |   Seed    |
//layout(location = 2) out vec4 o_Custom1;   // 

vec3 orbit(vec3 position, vec3 direction, vec3 move) {
	vec3 offset = vec3(0.0, 0.0, 0.0);
	vec3 axis = normalize(vec3(0.0, 1.0, 0.0));
	vec3 diff = position - offset;
	float distance = length(diff);
	vec3 normalDir;
	float radius;
	if (distance < 0.0001) {
		radius = 0.0001;
		normalDir = direction;
	} else {
		vec3 normal = diff - axis * dot(axis, normalize(diff)) * distance;
		radius = length(normal);
		if (radius < 0.0001) {
			normalDir = direction;
		} else {
			normalDir = normalize(normal);
		}
	}

	//float nextRadius = 0.1;
	float nextRadius = max(0.0001, radius + move.z);
	vec3 orbitDir = cross(axis, normalDir);
	float arc = 2.0 * 3.141592 * radius;
	float rotation = move.x / arc;

	vec3 rotationDir = orbitDir * sin(rotation) - normalDir * (1.0 - cos(rotation));
	vec3 velocity = rotationDir * radius + (rotationDir * 2.0 + normalDir) * radius * (nextRadius - radius);
	
	return velocity + axis * move.y;


	//float orbitLength = 2.0 * radius * 3.141592;
	//return orbitDir * 0.1 - normalDir * 0.01;
}

void main() {
	// Load data
	vec4 data0 = texelFetch(i_ParticleData0, ivec2(gl_FragCoord.xy), 0);
	vec4 data1 = texelFetch(i_ParticleData1, ivec2(gl_FragCoord.xy), 0);
	vec3 position = data0.xyz;
	vec3 direction = unpackVec3(data1.w);
	
	// Apply aging
	data1.x += DeltaTime;
	float lifetimeRatio = data1.x / data1.y;
	
	// Clculate velocity
	vec3 velocity = vec3(0.0);
	//if (Flags.x) {
		velocity += direction * mix(0.01, 0.0, lifetimeRatio);
	//}
	//if (Flags.y) {
	//	vec3 orbitMove = mix(vec3(0.01, 0.0, 0.0), vec3(0.5, 0.01, -0.01), lifetimeRatio);
	//	velocity += orbit(position, direction, orbitMove);
	//}
	//if (Flags.z) {
		velocity += 0.01 * noise3(position);
	//}
	//if (Flags.w) {
		//velocity += vec3(0.0, -0.0001, 0.0) * data1.x;
		vec3 targetPosition = vec3(0.2, 0.0, 0.0);
		vec3 diff = targetPosition - position;
		velocity += normalize(diff) * 0.01;
	//}

	// Update position
	position += velocity;
	
	// Update direction
	direction = (length(velocity) < 0.0001) ? direction : normalize(velocity);
	
	// Store data
	o_ParticleData0 = vec4(position, packVec3(direction));
	o_ParticleData1 = data1;
}
