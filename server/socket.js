const db = require("./db/database");
const axios = require("axios");
const { Server } = require("socket.io");
const { XMLParser } = require("fast-xml-parser");
const parser = new XMLParser();
const baseUrl = "https://assignments.reaktor.com/birdnest/";

const getDistance = require("./utils/getDistance");
const insertPilotInfo = require("./utils/insertPilotInfo");
const insertDroneInfo = require("./utils/insertDroneInfo");

/**
 ** In order to get less network request, I decided to pass the
 ** pilots data to the client through sockets.
 ** Every 2 seconds a get request will be done to the XML url
 ** and the pilots (and their drones) that got closer than 100m from the nest
 ** will be added to database.
 ** After that the socket will emit the new array of the pilots to be shown to the client
 **/

const socketServer = (server) => {
	const io = new Server(server, {
		cors: {
			origin: "http://localhost:3000",
		},
	});

	io.on("connection", (socket) => {
		setInterval(() => {
			axios.get(baseUrl + "drones").then((xml) => {
				let json = parser.parse(xml.data);
				let droneInfo = json.report.capture;
				let serialNumbers = [];
				let positions = [];
				for (const drone of droneInfo.drone) {
					let distance = getDistance(
						drone.positionX,
						drone.positionY
					);
					if (distance < 100000) {
						serialNumbers = [...serialNumbers, drone.serialNumber];
						insertPilotInfo(baseUrl, serialNumbers, distance);
						insertDroneInfo(drone);
						positions.push({
							serialNumber: drone.serialNumber,
							positionX: drone.positionX,
							positionY: drone.positionY,
						});
						io.emit("radar", positions);
					}
				}
			});
			let sql = `SELECT * FROM pilots INNER JOIN drones ON pilots.serialNumber = drones.serialNumber WHERE pilots.timestamp > DATE_SUB(NOW(), INTERVAL 10 MINUTE) ORDER BY pilots.timestamp DESC`;
			db.query(sql, (err, result) => {
				if (err) throw err;
				io.emit("getInfo", result);
			});

			sql = `DELETE FROM pilots WHERE timestamp < DATE_SUB(NOW(), INTERVAL 10 MINUTE)`;
			db.query(sql, (err, result) => {
				if (err) throw err;
			});

			sql = `DELETE FROM drones WHERE timestamp < DATE_SUB(NOW(), INTERVAL 10 MINUTE)`;
			db.query(sql, (err, result) => {
				if (err) throw err;
			});
		}, 20000);
	});
};

module.exports = socketServer;
