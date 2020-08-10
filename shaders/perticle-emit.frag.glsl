#version 300 es

precision highp float;
precision highp int;

flat in vec4 v_Position;
flat in vec4 v_Velocity;

layout(location = 0) out vec4 o_Position;
layout(location = 1) out vec4 o_Velocity;

void main() {
	o_Position = v_Position;
	o_Velocity = v_Velocity;
}
