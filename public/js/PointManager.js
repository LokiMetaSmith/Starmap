/*global THREE*/
//Class to hold all the map data after getting it from the api
import {
	MARKER_SIZE,
	HOVER_SCALE_MAX,
	HOVER_CHANGE_RATE,
	pointOffset,
	TYPES,
	MARKER_RING_SIZE,
	FADE_MIN_DIST,
	FADE_MAX_DIST,
	MAX_MOTION_TRAILS,
} from "./config.js";

import { lerp, hexToRgb, map, constrain } from "./functions.js";

function sortDiv(divId) {
	var i, shouldSwitch;
	const list = document.getElementById(divId);
	var switching = true;
	while (switching) {
		switching = false;
		const b = list.getElementsByTagName("p");
		for (i = 0; i < b.length - 1; i++) {
			shouldSwitch = false;
			if (b[i].innerHTML.toLowerCase() > b[i + 1].innerHTML.toLowerCase()) {
				shouldSwitch = true;
				break;
			}
		}
		if (shouldSwitch) {
			b[i].parentNode.insertBefore(b[i + 1], b[i]);
			switching = true;
		}
	}
}

function hide(elm) {
	elm.style.visibility = "hidden";
	elm.style.position = "absolute";
}
function unhide(elm) {
	elm.style.position = "";
	elm.style.visibility = "";
}

function fromGamePos(position) {
	return {
		x: position.y + pointOffset.x,
		y: position.z + pointOffset.y,
		z: -position.x + pointOffset.z,
	};
}
class Point {
	constructor(pointData, app) {
		this.app = app;
		this.shown = true;
		this.marker;
		this.linePart;
		this.color;
		this.position;
		this.ownerID;
		this.vanity;
		this.nameText;
		this.id;
		this.group;
		this.ring;
		this.groupID;
		this.hoverEffect = 0;
		this.isHovered = false;
		this.isHoveredSide = false;
		this.info = {
			name: null,
			gamePos: null,
			desc: null,
			type: null,
			createdBy: null,
		};
		this.init(pointData);
	}
	//Creates the Threejs elements, sidebar elements, and internal object for the point
	init(data) {
		const color = data.color || TYPES[data.type].color; //If no color is provided fall back to default
		const position = fromGamePos(data.pos);
		//Line from the astroid belt up
		var points = [];
		points.push(new THREE.Vector3(0, 0, 0));
		points.push(new THREE.Vector3(0, -position.y, 0));
		var lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
		var material = new THREE.LineBasicMaterial({
			color: color,
			side: THREE.DoubleSide,
		});
		var line = new THREE.Line(lineGeometry, material);
		line.position.set(position.x, position.y, position.z);
		this.app.sceneObjs.scene.add(line);

		const markerGeometry = new THREE.PlaneGeometry(
			MARKER_SIZE,
			MARKER_SIZE,
			3,
			3
		);
		// console.log(this.app.pointManager.pointTextures, data.type);
		var mat = new THREE.MeshBasicMaterial({
			color: color,
			transparent: true,
			alphaMap: this.app.pointManager.pointTextures[data.type],
			side: THREE.DoubleSide,
		});
		var object = new THREE.Mesh(markerGeometry, mat);
		this.app.sceneObjs.scene.add(object);

		//Base ring thing
		const ringGeom = new THREE.RingGeometry(
			MARKER_RING_SIZE,
			MARKER_RING_SIZE + 100,
			32,
			8
		);
		const ring = new THREE.Mesh(ringGeom, material);
		ring.rotation.set(Math.PI / 2, 0, 0);
		ring.position.set(position.x, 0, position.z);
		this.app.sceneObjs.scene.add(ring);
		//Create clickable sidebar element
		const self = this;
		const sidebarElm = document.createElement("p");
		sidebarElm.innerText = data.name;
		sidebarElm.id = `side-${data.id}`;
		sidebarElm.classList.add("sidenav-point");

		document.getElementById("points").appendChild(sidebarElm);
		sidebarElm.onclick = () => {
			self.app.cameraController.lerpCamTo(
				position.x,
				position.y,
				position.z
			);
			self.app.handleObjectClick(object);
		};
		sidebarElm.onmouseover = () => {
			self.updateHoverSidebar(true);
		};
		sidebarElm.onmouseout = () => {
			self.updateHoverSidebar(false);
		};
		this.addLayerSortElm(data, object);

		const nameText = this.createNameMesh(data, color);

		this.marker = object;
		this.linePart = line;
		this.color = color;
		this.position = position;
		this.ownerID = data.ownerID;
		this.nameText = nameText;
		this.name = name;
		this.id = data.id;
		this.ring = ring;
		this.group = data.group;
		this.groupID = data.groupID;
		this.vanity = data.vanity;
		this.info = {
			name: data.name,
			gamePos: data.pos,
			desc: data.desc,
			type: data.type,
			createdBy: data.createdBy,
		};
		this.updateNamePosition();
		this.updateMarkerPosition();
		this.updateShow(true);
	}
	createNameMesh(data, color) {
		const canv = createTextCanvas(data.name, {
			fontSize: 500,
			color: color,
		});
		const texture = new THREE.CanvasTexture(canv);
		const textMat = new THREE.MeshBasicMaterial({
			map: texture,
			side: THREE.DoubleSide,
			color: "#ffffff",
			transparent: true,
			alphaTest: 0.01,
		});
		textMat.map.premultiplyAlpha = false;
		textMat.map.needsUpdate = true;
		const maxAnisotropy = this.app.sceneObjs.renderer.capabilities.getMaxAnisotropy();
		textMat.anisotropy = maxAnisotropy;
		const textGeom = new THREE.PlaneGeometry(canv.width, canv.height, 4, 4);
		const nameText = new THREE.Mesh(textGeom, textMat);
		this.app.sceneObjs.scene.add(nameText);
		return nameText;
	}
	addLayerSortElm(data, object) {
		const self = this;
		const sidebar = document.getElementById(`sort-div-${data.groupID}`);
		const sidebarElm = document.createElement("p");
		sidebarElm.innerText = data.name;
		sidebarElm.id = `side-layersort-${data.id}`;
		let defaultOpen = false;
		if (sidebar.children[0]) {
			//Layer might be open, if so want to keep its padding on by default
			defaultOpen = !sidebar.children[0].classList.contains("nopadding");
		}
		if (defaultOpen) {
			sidebarElm.style.maxHeight = sidebarElm.scrollHeight + "px";
		} else {
			sidebarElm.classList.add("nopadding");
		}
		sidebarElm.classList.add("sidenav-point");
		sidebarElm.classList.add("colap-content");
		sidebar.appendChild(sidebarElm);
		sidebarElm.onclick = () => {
			self.app.cameraController.lerpCamTo(
				object.position.x,
				object.position.y,
				object.position.z
			);
			self.app.handleObjectClick(object);
		};
		sidebarElm.onmouseover = () => {
			self.updateHoverSidebar(true);
		};
		sidebarElm.onmouseout = () => {
			self.updateHoverSidebar(false);
		};
	}
	//Updates the position of the name ontop of the point
	updateNamePosition(scale) {
		const mult = this.position.y > 0 ? -1 : 1;
		const s = scale ? scale : 1;
		this.nameText.position.set(
			this.position.x,
			this.position.y - (MARKER_SIZE * s + 300) * mult,
			this.position.z
		);
	}
	//Updates the positon of the main marker
	updateMarkerPosition() {
		this.linePart.position.set(
			this.position.x,
			this.position.y,
			this.position.z
		);
		this.ring.position.set(this.position.x, 0, this.position.z);

		this.marker.position.set(
			this.position.x, // - (MARKER_SIZE * s / 2),
			this.position.y, // + (MARKER_SIZE * s / 2) * mult,
			this.position.z // - (MARKER_SIZE * s / 2) * mult
		);
	}
	//Compares point data from the api to the current point to see if anything has changed
	compareTo(pointData) {
		return (
			pointData.pos.x == this.info.gamePos.x &&
			pointData.pos.y == this.info.gamePos.y &&
			pointData.pos.z == this.info.gamePos.z &&
			pointData.desc == this.info.desc &&
			pointData.type == this.info.type &&
			pointData.name == this.info.name &&
			pointData.groupID == this.groupID &&
			pointData.color == this.color &&
			pointData.vanity == this.vanity
		);
	}
	//Updates the current point based on new data from the api
	update(pointData) {
		const isIdentical = this.compareTo(pointData);
		if (isIdentical) {
			return;
		}
		const position = fromGamePos(pointData.pos);
		const color = pointData.color;
		const noNameChange = this.info.name == pointData.name;
		const noPosChange =
			pointData.pos.x == this.info.gamePos.x &&
			pointData.pos.y == this.info.gamePos.y &&
			pointData.pos.z == this.info.gamePos.z;
		this.info.desc = pointData.desc;
		this.info.name = pointData.name;
		this.info.type = pointData.type;
		this.info.gamePos = pointData.pos;
		this.groupID = pointData.groupID;
		this.vanity = pointData.vanity;
		this.group = pointData.group;
		this.color = pointData.color;
		this.marker.material.color.set(pointData.color);
		this.nameText.material.color.set(pointData.color);
		this.linePart.material.color.set(pointData.color);
		this.marker.material.alphaMap = this.app.pointManager.pointTextures[
			pointData.type
		];
		this.marker.material.needsUpdate = true;
		this.linePart.geometry.attributes.position.array[4] = -position.y;
		this.linePart.geometry.attributes.position.needsUpdate = true;
		this.ring.position.set(0, -position.y, 0);
		if (!noPosChange) {
			if (
				this.app.pointManager.focusedPOI &&
				this.app.pointManager.focusedPOI.id == this.id
			) {
				this.app.cameraController.lerpCamTo(
					position.x,
					position.y,
					position.z
				);
			}
			if (pointData.showPrev) this.createMoveMarker(position);
			this.position.x = position.x;
			this.position.y = position.y;
			this.position.z = position.z;
			this.updateMarkerPosition();
			this.updateNamePosition();
		}
		//AHHHH ThreeJS why is there no option to change text live time
		if (!noNameChange) {
			this.app.sceneObjs.scene.remove(this.nameText);
			this.nameText = this.createNameMesh(pointData, color);
			this.updateNamePosition();
		}
		document.getElementById(`side-${pointData.id}`).innerText =
			pointData.name;
		document.getElementById(`side-layersort-${pointData.id}`).innerText =
			pointData.name;
		const selected = this.app.pointManager.focusedPOI;
		if (selected && selected.id == this.id) {
			this.app.handleObjectClick(this);
		}
	}
	createMoveMarker(newPosition) {
		const newPos = new THREE.Vector3(
			newPosition.x,
			newPosition.y,
			newPosition.z
		);
		const curPos = new THREE.Vector3(
			this.position.x,
			this.position.y,
			this.position.z
		);
		const color = "#0000ff";
		var points = [];
		points.push(curPos);
		points.push(newPos);
		var lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
		var material = new THREE.LineDashedMaterial({
			color: color, //this.color,
			side: THREE.DoubleSide,
			linewidth: 1,
			scale: 1,
			dashSize: 30,
			gapSize: 10,
		});
		var line = new THREE.Line(lineGeometry, material);
		this.app.sceneObjs.scene.add(line);
		this.app.pointManager.motionTrails.push(line);
		if (this.app.pointManager.motionTrails.length > MAX_MOTION_TRAILS) {
			const oldLine = this.app.pointManager.motionTrails.shift();
			this.app.sceneObjs.scene.remove(oldLine);
		}
	}
	//Deletes the point and all of its elements
	dispose() {
		this.app.sceneObjs.scene.remove(this.marker);
		this.app.sceneObjs.scene.remove(this.linePart);
		this.app.sceneObjs.scene.remove(this.nameText);
		this.app.sceneObjs.scene.remove(this.ring);
		const pointsBar = document.getElementById("points");
		const layersBar = document.getElementById(`sort-div-${this.groupID}`);
		const textElm = document.getElementById("side-" + this.id);
		const textElm2 = document.getElementById("side-layersort-" + this.id);

		pointsBar.removeChild(textElm);
		layersBar.removeChild(textElm2);
	}
	//Shows or hides the point
	updateShow(show) {
		// console.log(this.id, show);
		this.shown = show;
		this.marker.visible = show && this.app.pointManager.shows.marker;
		this.linePart.visible = show && this.app.pointManager.shows.line;
		this.nameText.visible = show && this.app.pointManager.shows.nameText;
		this.ring.visible = show && this.app.pointManager.shows.ring;
		const action = show ? unhide : hide;
		action(document.getElementById(`side-${this.id}`));
		action(document.getElementById(`side-layersort-${this.id}`));
	}
	//Updates the scale of the point based off the global scale (due to current zoom) and the point scale (due to hover)
	runScale(scale) {
		if (this.isHovered || this.isHoveredSide) {
			this.hoverEffect = lerp(
				this.hoverEffect,
				HOVER_SCALE_MAX,
				HOVER_CHANGE_RATE
			);
		} else {
			this.hoverEffect = lerp(this.hoverEffect, 0, HOVER_CHANGE_RATE);
		}
		const newScale = scale + this.hoverEffect;
		this.marker.scale.set(newScale, newScale, newScale);
		this.nameText.scale.set(newScale, newScale, newScale);
		this.updateMarkerPosition(newScale);
		this.updateNamePosition(newScale);
		const dist = this.marker.position.distanceTo(
			this.app.sceneObjs.camera.position
		);
		this.marker.material.opacity = constrain(
			map(dist, FADE_MIN_DIST, FADE_MAX_DIST, 0, 1),
			0,
			1
		);
	}
	updateHoverSidebar(hover) {
		this.isHoveredSide = hover;
		if (this.app.pointManager.onlyShowNameOnHover && !hover) {
			this.nameText.visible = false;
		} else if (this.shown) {
			this.nameText.visible = true;
		}
	}
	updateHoverMain(hover) {
		this.isHovered = hover;
		//This function gets called per frame, so need to prevent overriding sidebar hover which only happens per mouse event
		if (
			this.app.pointManager.onlyShowNameOnHover &&
			!hover &&
			!this.isHoveredSide
		) {
			this.nameText.visible = false;
		} else if (this.shown) {
			this.nameText.visible = true;
		}
	}
}
export default class PointManager {
	constructor(app) {
		this.app = app;
		this.points = [];
		this.pointTextures = {};
		this.motionTrails = [];
		this.connectorLine;
		this.shows = {
			marker: true,
			line: true,
			nameText: true,
			ring: true,
		};
		this.focusedPOI;
		this.initFocusOn = this.app.storage.getItem("pointFocus");
		this.hasInitFocus = false;
		this.onlyShowNameOnHover = false;
		const loader = new THREE.TextureLoader();
		for (var t in TYPES) {
			this.pointTextures[t] = loader.load(TYPES[t].icons.map);
		}
	}
	checkSort() {
		sortDiv("points");
		const layers = document.getElementById("layers");
		for (var i = 0; i < layers.childElementCount; i++) {
			if (layers.children[i].tagName == "DIV") {
				sortDiv(layers.children[i].id);
			}
		}
	}
	//Adds a point from api data
	addPoint(pointData) {
		const newPoint = new Point(pointData, this.app);
		this.points.push(newPoint);
		if (!this.hasInitFocus && this.initFocusOn) {
			if (
				pointData.id == this.initFocusOn ||
				pointData.vanity == this.initFocusOn
			) {
				this.app.handleObjectClick(newPoint);
				this.app.cameraController.lerpCamTo(
					newPoint.marker.position.x,
					newPoint.marker.position.y,
					newPoint.marker.position.z
				);
				this.hasInitFocus = true;
				this.app.storage.removeItem("pointFocus");
			}
		}
		this.checkSort();
		this.updateDisplayed(this.app.viewFilters);
	}
	//Returns a point based off the threejs uuid of the marker (only used for the raycast intersection)
	getByThreeId(id) {
		return this.points.find((p) => p.marker.uuid == id);
	}
	//Returns a point based off the mongoDB id (used more commonly)
	getById(id) {
		return this.points.find((p) => p.id == id);
	}
	//Removes a point by its mongoDB id
	removeById(id) {
		const point = this.points.find((p) => p.id == id);
		this.points = this.points.filter((p) => p.id != id);
		if (point) {
			point.dispose();
		}
	}
	//Updates a point from api data
	updatePoint(pointData) {
		const point = this.getById(pointData.id);
		point.update(pointData);
	}
	//Updates which points should and shouldnt be displayed
	updateDisplayed(filters) {
		this.points.forEach((point) => {
			const show =
				filters.types[point.info.type] && filters.groups[point.groupID];
			point.updateShow(show != undefined ? show : true);
		});
		for (var groupID in filters.groups) {
			const div = document.getElementById(`sort-div-${groupID}`);
			const header = document.getElementById(`layer-header-${groupID}`);
			if (filters.groups[groupID]) {
				unhide(div);
				unhide(header);
			} else {
				hide(div);
				hide(header);
			}
		}
	}
	//Updates all the point scales
	runScales(scale) {
		this.points.forEach((point) => {
			point.runScale(scale);
		});
	}
	updateLayers() {
		this.points.forEach((point) => {
			point.addLayerSortElm(point, point.marker);
		});
	}
	setVis(elm, newVis) {
		this.shows[elm] = newVis;
		this.points.forEach((point) => {
			point.updateShow(point.shown);
		});
	}
}

function createTextCanvas(string, parameters = {}) {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");

	// Prepare the font to be able to measure
	let fontSize = parameters.fontSize || 56;
	ctx.font = `${fontSize}px Roboto`;

	const textMetrics = ctx.measureText(string);

	let width = textMetrics.width;
	let height = fontSize;

	canvas.width = width;
	canvas.height = height;
	canvas.style.width = width + "px";
	canvas.style.height = height + "px";

	ctx.font = `${fontSize}px Roboto`;
	ctx.textAlign = parameters.align || "center";
	ctx.textBaseline = parameters.baseline || "middle";
	const rgb = hexToRgb(parameters.color);
	ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.01)`;
	ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

	ctx.fillStyle = parameters.color || "white";
	ctx.fillText(string, width / 2, height / 2);

	ctx.strokeStyle = parameters.color || "white";
	ctx.strokeText(string, width / 2, height / 2);

	return canvas;
}
