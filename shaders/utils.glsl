
#include "noise/noise3D.glsl"

float packVec3(vec3 v) {
	uvec3 i = uvec3((v + 1.0) * 0.5 * 1023.0);
	return uintBitsToFloat(i.x | (i.y << 10) | (i.z << 20));
}

vec3 unpackVec3(float s) {
	uint bits = floatBitsToUint(s);
	vec3 v = vec3(uvec3(bits, bits >> 10, bits >> 20) & 1023u);
	return v / 1023.0 * 2.0 - 1.0;
}

float rand(vec2 seed) {
    return fract(sin(dot(seed, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 noise3(vec3 seed) {
	return vec3(snoise(seed.xyz), snoise(seed.yzx), snoise(seed.zxy));
}
