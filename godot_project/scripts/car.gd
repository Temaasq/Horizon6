extends VehicleBody3D

@export var max_engine_force: float = 320.0
@export var max_brake_force: float = 18.0
@export var max_steer_angle: float = 0.55
@export var steer_speed: float = 6.0

var steer_target: float = 0.0
var current_speed_kmh: float = 0.0

# Mobile input flags (updated by UI touch controls)
var input_gas: float = 0.0
var input_brake: float = 0.0
var input_steer: float = 0.0
var input_handbrake: bool = false

@onready var front_left_wheel: VehicleWheel3D = $FrontLeft
@onready var front_right_wheel: VehicleWheel3D = $FrontRight
@onready var back_left_wheel: VehicleWheel3D = $BackLeft
@onready var back_right_wheel: VehicleWheel3D = $BackRight

func _physics_process(delta: float) -> void:
	current_speed_kmh = linear_velocity.length() * 3.6
	
	# Handle input (combines keyboard + touch)
	var throttle = input_gas
	if Input.is_action_pressed("ui_up"):
		throttle = 1.0
	
	var brake_val = input_brake
	if Input.is_action_pressed("ui_down"):
		brake_val = 1.0
		
	var steer_dir = input_steer
	if Input.is_action_pressed("ui_left"):
		steer_dir += 1.0
	if Input.is_action_pressed("ui_right"):
		steer_dir -= 1.0
	steer_dir = clampf(steer_dir, -1.0, 1.0)
	
	# Smooth steering
	steer_target = steer_dir * max_steer_angle
	steering = move_toward(steering, steer_target, steer_speed * delta)
	
	# Throttle & Brake
	var handbrake_active = input_handbrake or Input.is_key_pressed(KEY_SPACE)
	if handbrake_active:
		engine_force = 0.0
		brake = max_brake_force * 1.5
	elif brake_val > 0.0:
		# If moving forward, brake; if almost stopped, reverse
		var forward_speed = -linear_velocity.dot(global_transform.basis.z)
		if forward_speed > 1.0:
			engine_force = 0.0
			brake = brake_val * max_brake_force
		else:
			brake = 0.0
			engine_force = -brake_val * (max_engine_force * 0.6)
	else:
		brake = 0.0
		engine_force = throttle * max_engine_force

func reset_position(spawn_transform: Transform3D) -> void:
	global_transform = spawn_transform
	linear_velocity = Vector3.ZERO
	angular_velocity = Vector3.ZERO
