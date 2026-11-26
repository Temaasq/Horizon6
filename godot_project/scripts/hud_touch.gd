extends CanvasLayer

@export var car_path: NodePath
var car: Node = null

@onready var speed_label: Label = $HUD/SpeedLabel
@onready var btn_left: Button = $Controls/Left
@onready var btn_right: Button = $Controls/Right
@onready var btn_gas: Button = $Controls/Gas
@onready var btn_brake: Button = $Controls/Brake
@onready var btn_handbrake: Button = $Controls/Handbrake
@onready var btn_reset: Button = $Controls/Reset

var initial_car_transform: Transform3D

func _ready() -> void:
	if not car_path.is_empty():
		car = get_node(car_path)
		if car:
			initial_car_transform = car.global_transform
	
	if btn_reset:
		btn_reset.pressed.connect(_on_reset_pressed)

func _process(_delta: float) -> void:
	if not car:
		return
	
	# Update inputs
	var steer = 0.0
	if btn_left and btn_left.button_pressed:
		steer += 1.0
	if btn_right and btn_right.button_pressed:
		steer -= 1.0
	car.input_steer = steer
	
	car.input_gas = 1.0 if (btn_gas and btn_gas.button_pressed) else 0.0
	car.input_brake = 1.0 if (btn_brake and btn_brake.button_pressed) else 0.0
	car.input_handbrake = (btn_handbrake and btn_handbrake.button_pressed)
	
	# Update speedometer
	if speed_label and "current_speed_kmh" in car:
		speed_label.text = "%d KM/H" % int(car.current_speed_kmh)

func _on_reset_pressed() -> void:
	if car and car.has_method("reset_position"):
		car.reset_position(initial_car_transform)
