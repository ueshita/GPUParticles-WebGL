#version 300 es

precision highp float;
precision highp int;

#include "noise/noise2D.glsl"

uniform sampler2D i_Position;
uniform sampler2D i_Velocity;
uniform float deltaTime;

layout(location = 0) out vec4 o_Position;  // xyz:position, w:age
layout(location = 1) out vec4 o_Velocity;  // xyz:velocity, w:lifetime
//layout(location = 2) out vec4 o_Custom1;   // 

void main() {
	// Load data
	vec4 position = texelFetch(i_Position, ivec2(gl_FragCoord.xy), 0);
	vec4 velocity = texelFetch(i_Velocity, ivec2(gl_FragCoord.xy), 0);
	// Apply aging
	position.w += deltaTime;
	// Apply gravity
	//velocity.y -= 0.0003;
	velocity.xyz += 0.001 * vec3(snoise(position.xy), snoise(position.yz), 0.0);
	// Update position
	position.xyz += velocity.xyz;
	// Store data
	o_Position = position;
	o_Velocity = velocity;
}
