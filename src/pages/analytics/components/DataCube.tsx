import AppsIcon from "@mui/icons-material/Apps";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import { Box, CircularProgress, IconButton, Tooltip, Typography } from "@mui/material";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import * as THREE from "three";
import type { InstalledAppInfo } from "../../../store/installedAppsStore";

interface DataCubeProps {
	installedApps: InstalledAppInfo[];
	loading: boolean;
	onAppSelect: (app: InstalledAppInfo | null) => void;
}

interface AppBlockProps {
	cubePosition: [number, number, number];
	gridPosition: [number, number, number];
	app: InstalledAppInfo;
	isSelected: boolean;
	onClick: () => void;
	index: number;
	isGridView: boolean;
}

const AppBlock = ({ cubePosition, gridPosition, app, isSelected, onClick, index, isGridView }: AppBlockProps) => {
	const meshRef = useRef<THREE.Mesh>(null);
	const [hovered, setHovered] = useState(false);
	const currentPosition = useRef<[number, number, number]>(cubePosition);
	const baseRotation = useRef({ x: 0, y: 0, z: 0 });

	// Generate color based on app name hash
	const getAppColor = (appName: string) => {
		const colors = [
			"#58a6ff", "#f85149", "#3fb950", "#d2a8ff",
			"#ffa657", "#79c0ff", "#ff7b72", "#56d364",
			"#bc8cff", "#ffa198", "#7ee787", "#a5d6ff"
		];
		let hash = 0;
		for (let i = 0; i < appName.length; i++) {
			hash = appName.charCodeAt(i) + ((hash << 5) - hash);
		}
		return colors[Math.abs(hash) % colors.length];
	};

	const color = getAppColor(app.name);

	// Animate between cube and grid layouts
	useFrame((state, delta) => {
		if (meshRef.current) {
			// Choose target position based on view mode
			const basePosition = isGridView ? gridPosition : cubePosition;

			const extrudeDistance = isSelected ? 1.2 : 0;
			const direction = new THREE.Vector3(...basePosition).normalize();
			const targetPosition: [number, number, number] = [
				basePosition[0] + direction.x * extrudeDistance,
				basePosition[1] + direction.y * extrudeDistance,
				basePosition[2] + direction.z * extrudeDistance,
			];

			// Smooth interpolation between positions
			currentPosition.current = [
				THREE.MathUtils.lerp(currentPosition.current[0], targetPosition[0], delta * 4),
				THREE.MathUtils.lerp(currentPosition.current[1], targetPosition[1], delta * 4),
				THREE.MathUtils.lerp(currentPosition.current[2], targetPosition[2], delta * 4),
			];

			meshRef.current.position.set(...currentPosition.current);

			// Gentle rotation when selected - keep rotation smooth
			if (isSelected) {
				baseRotation.current.y += delta * 0.8;
				baseRotation.current.x += delta * 0.3;
				meshRef.current.rotation.set(
					baseRotation.current.x,
					baseRotation.current.y,
					0
				);
			} else {
				// Reset rotation smoothly when deselected
				baseRotation.current.x = THREE.MathUtils.lerp(baseRotation.current.x, 0, delta * 5);
				baseRotation.current.y = THREE.MathUtils.lerp(baseRotation.current.y, 0, delta * 5);
				meshRef.current.rotation.set(0, 0, 0);
			}
		}
	});

	return (
		<mesh
			ref={meshRef}
			onClick={(e) => {
				e.stopPropagation();
				onClick();
			}}
			onPointerOver={(e) => {
				e.stopPropagation();
				document.body.style.cursor = "pointer";
				setHovered(true);
			}}
			onPointerOut={(e) => {
				e.stopPropagation();
				document.body.style.cursor = "default";
				setHovered(false);
			}}
		>
			<boxGeometry args={[0.85, 0.85, 0.85]} />
			<meshStandardMaterial
				color={color}
				transparent
				opacity={hovered || isSelected ? 0.9 : 0.7}
				wireframe={false}
				emissive={color}
				emissiveIntensity={hovered || isSelected ? 0.6 : 0.3}
				metalness={0.3}
				roughness={0.4}
			/>
			{/* Wireframe overlay */}
			<lineSegments>
				<edgesGeometry args={[new THREE.BoxGeometry(0.85, 0.85, 0.85)]} />
				<lineBasicMaterial color={hovered || isSelected ? "#ffffff" : color} transparent opacity={0.6} />
			</lineSegments>
		</mesh>
	);
};

const CubeScene = ({ installedApps, onAppSelect, isGridView }: Omit<DataCubeProps, "loading"> & { isGridView: boolean }) => {
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

	const handleBlockClick = (app: InstalledAppInfo, index: number) => {
		if (selectedIndex === index) {
			setSelectedIndex(null);
			onAppSelect(null);
		} else {
			setSelectedIndex(index);
			onAppSelect(app);
		}
	};

	// Calculate cube dimensions to fit all apps
	const totalApps = installedApps.length;
	const cubeSize = Math.ceil(Math.cbrt(totalApps)); // Size of one side of the cube

	// Generate cube positions
	const cubePositions: [number, number, number][] = [];
	let appIndex = 0;

	for (let x = 0; x < cubeSize && appIndex < totalApps; x++) {
		for (let y = 0; y < cubeSize && appIndex < totalApps; y++) {
			for (let z = 0; z < cubeSize && appIndex < totalApps; z++) {
				// Center the cube around origin
				const posX = x - (cubeSize - 1) / 2;
				const posY = y - (cubeSize - 1) / 2;
				const posZ = z - (cubeSize - 1) / 2;
				cubePositions.push([posX, posY, posZ]);
				appIndex++;
			}
		}
	}

	// Generate grid positions (flat grid layout)
	const gridPositions: [number, number, number][] = [];
	const gridCols = Math.ceil(Math.sqrt(totalApps)); // Square-ish grid
	const gridRows = Math.ceil(totalApps / gridCols);

	for (let i = 0; i < totalApps; i++) {
		const col = i % gridCols;
		const row = Math.floor(i / gridCols);
		const posX = col - (gridCols - 1) / 2;
		const posY = (gridRows - 1) / 2 - row; // Invert Y to start from top
		const posZ = 0; // All in the same Z plane
		gridPositions.push([posX, posY, posZ]);
	}

	return (
		<>
			<ambientLight intensity={0.4} />
			<pointLight position={[10, 10, 10]} intensity={1.2} color="#58a6ff" />
			<pointLight position={[-10, -10, -10]} intensity={0.8} color="#f85149" />
			<pointLight position={[0, 15, 0]} intensity={0.9} color="#ffffff" />
			<pointLight position={[0, -10, 10]} intensity={0.6} color="#3fb950" />

			{/* Render app blocks */}
			{installedApps.map((app, index) => (
				<AppBlock
					key={app.appId}
					cubePosition={cubePositions[index]}
					gridPosition={gridPositions[index]}
					app={app}
					isSelected={selectedIndex === index}
					onClick={() => handleBlockClick(app, index)}
					index={index}
					isGridView={isGridView}
				/>
			))}

			{/* Large wireframe box outline around the entire cube - only show in cube mode */}
			{!isGridView && (
				<lineSegments>
					<edgesGeometry args={[new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize)]} />
					<lineBasicMaterial color="#30363d" transparent opacity={0.5} linewidth={2} />
				</lineSegments>
			)}

			<OrbitControls
				enablePan={true}
				enableZoom={true}
				enableRotate={true}
				minDistance={cubeSize * 2}
				maxDistance={cubeSize * 5}
				autoRotate={selectedIndex === null}
				autoRotateSpeed={0.5}
				makeDefault
			/>
		</>
	);
};

export const DataCube = ({ installedApps, loading, onAppSelect }: DataCubeProps) => {
	const [isGridView, setIsGridView] = useState(false);

	if (loading || installedApps.length === 0) {
		return (
			<Box
				sx={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					height: "100%",
					gap: 2,
				}}
			>
				<CircularProgress sx={{ color: "#58a6ff" }} />
				<Typography sx={{ color: "#8b949e", fontFamily: "monospace" }}>
					{loading ? "Loading installed apps..." : "No apps installed"}
				</Typography>
			</Box>
		);
	}

	const cubeSize = Math.ceil(Math.cbrt(installedApps.length));
	const cameraDistance = cubeSize * 3.5;

	return (
		<Box sx={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }}>
			<Canvas
				camera={{ position: [cameraDistance, cameraDistance, cameraDistance], fov: 50 }}
				onCreated={(state) => {
					// Configure raycaster for better precision
					state.raycaster.params.Line = { threshold: 0.1 };
					state.raycaster.params.Points = { threshold: 0.1 };

					// Filter to only detect visible objects
					state.setEvents({
						filter: (intersections) => {
							// Only return the closest visible object to avoid detecting multiple overlapping objects
							const visible = intersections.filter((i) => i.object.visible);
							return visible.length > 0 ? [visible[0]] : [];
						}
					});
				}}
				style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
			>
				<CubeScene installedApps={installedApps} onAppSelect={onAppSelect} isGridView={isGridView} />
			</Canvas>

			{/* Toggle View Button */}
			<Box
				sx={{
					position: "absolute",
					top: 16,
					left: 16,
					zIndex: 10,
				}}
			>
				<Tooltip title={isGridView ? "Switch to Cube View" : "Switch to Grid View"} placement="right">
					<IconButton
						onClick={() => setIsGridView(!isGridView)}
						sx={{
							bgcolor: "rgba(22, 27, 34, 0.95)",
							border: "1px solid #30363d",
							color: "#58a6ff",
							backdropFilter: "blur(10px)",
							"&:hover": {
								bgcolor: "rgba(88, 166, 255, 0.1)",
								borderColor: "#58a6ff",
							},
						}}
					>
						{isGridView ? <ViewInArIcon /> : <AppsIcon />}
					</IconButton>
				</Tooltip>
			</Box>

			{/* Info overlay */}
			<Box
				sx={{
					position: "absolute",
					bottom: 16,
					left: 16,
					bgcolor: "rgba(22, 27, 34, 0.95)",
					border: "1px solid #30363d",
					p: 2,
					borderRadius: 1,
					backdropFilter: "blur(10px)",
				}}
			>
				<Typography
					variant="caption"
					sx={{
						color: "#8b949e",
						fontFamily: "monospace",
						textTransform: "uppercase",
						display: "block",
						mb: 1,
						fontWeight: 700,
					}}
				>
					Data Cube Visualization
				</Typography>
				<Typography variant="body2" sx={{ color: "#c9d1d9", fontFamily: "monospace", fontSize: "0.75rem" }}>
					• Total Apps: {installedApps.length}
					<br />
					• Cube Size: {cubeSize}×{cubeSize}×{cubeSize}
					<br />
					<br />
					<span style={{ color: "#8b949e" }}>Controls:</span>
					<br />
					• Click: Select/Deselect app
					<br />
					• Drag: Rotate view
					<br />• Scroll: Zoom in/out
				</Typography>
			</Box>
		</Box>
	);
};
