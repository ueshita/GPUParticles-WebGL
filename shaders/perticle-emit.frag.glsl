#version 300 es

precision highp float;
precision highp int;

#include "utils.glsl"

flat in vec3 v_Particle;
flat in vec3 v_Position;
flat in vec3 v_Direction;

layout(location = 0) out vec4 o_ParticleData0; // |   Pos X   |   Pos Y   |   Pos Z   |  Dir XYZ  |
layout(location = 1) out vec4 o_ParticleData1; // | LifeCount | Lifetime  |   Seed    |  Vel XYZ  |

void main() {
	float packedDir = packVec3(normalize(v_Direction));
	o_ParticleData0 = vec4(v_Position, packedDir);
	o_ParticleData1 = vec4(0.0, v_Particle.y, v_Particle.z, packedDir);
}
