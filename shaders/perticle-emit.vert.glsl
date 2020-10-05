#version 300 es

precision highp float;
precision highp int;

layout(location = 0) in vec3 a_Particle;  // x:ParticleID, y:Lifetime, z:Seed
layout(location = 1) in vec3 a_Position;
layout(location = 2) in vec3 a_Direction;

flat out vec3 v_Particle;
flat out vec3 v_Position;
flat out vec3 v_Direction;

uniform ivec2 ID2TPos;
uniform vec4 TPos2VPos;

void main() {
	int particleID = int(a_Particle.x);
	vec2 glpos = vec2(particleID & ID2TPos.x, particleID >> ID2TPos.y) * TPos2VPos.xy + TPos2VPos.zw;
	gl_Position = vec4(glpos, 0.0, 1.0);
	gl_PointSize = 1.0;
	v_Particle = a_Particle;
	v_Position = a_Position;
	v_Direction = a_Direction;
}
