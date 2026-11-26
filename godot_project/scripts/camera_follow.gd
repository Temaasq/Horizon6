extends Camera3D

@export var target_path: NodePath
@export var distance: float = 6.5
@export var height: float = 2.4
@export var follow_speed: float = 8.0
@export var look_ahead: float = 2.0

var target_node: Node3D = null

func _ready() -> void:
	if not target_path.is_empty():
		target_node = get_node(target_path)

func _physics_process(delta: float) -> void:
	if not target_node:
		return
	
	var target_pos = target_node.global_position
	var target_forward = -target_node.global_transform.basis.z
	
	# Position behind the car based on car's orientation
	var desired_pos = target_pos - target_forward * distance + Vector3.UP * height
	global_position = global_position.lerp(desired_pos, follow_speed * delta)
	
	# Look slightly ahead of the car
	var look_target = target_pos + target_forward * look_ahead + Vector3.UP * 0.8
	look_at(look_target, Vector3.UP)
