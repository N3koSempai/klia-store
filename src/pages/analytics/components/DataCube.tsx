import AppsIcon from "@mui/icons-material/Apps";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import FolderIcon from "@mui/icons-material/Folder";
import StorageIcon from "@mui/icons-material/Storage";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import type { InstalledAppInfo } from "../../../store/installedAppsStore";

export type PermissionFilter = "storage" | "camera" | "files" | null;

interface DataCubeProps {
  installedApps: InstalledAppInfo[];
  loading: boolean;
  onAppSelect: (app: InstalledAppInfo | null) => void;
  onPermissionFilterChange: (filter: PermissionFilter) => void;
  selectedApp: InstalledAppInfo | null;
}

interface AppBlockProps {
  cubePosition: [number, number, number];
  gridPosition: [number, number, number];
  app: InstalledAppInfo;
  isSelected: boolean;
  onClick: () => void;
  isGridView: boolean;
  hasPermission: boolean;
  permissionFilter: PermissionFilter;
}

const AppBlock = ({
  cubePosition,
  gridPosition,
  app,
  isSelected,
  onClick,
  isGridView,
  hasPermission,
  permissionFilter,
}: AppBlockProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const currentPosition = useRef<[number, number, number]>(cubePosition);
  const baseRotation = useRef({ x: 0, y: 0, z: 0 });

  // Generate color based on app name hash
  const getAppColor = (appName: string) => {
    const colors = [
      "#58a6ff",
      "#f85149",
      "#3fb950",
      "#d2a8ff",
      "#ffa657",
      "#79c0ff",
      "#ff7b72",
      "#56d364",
      "#bc8cff",
      "#ffa198",
      "#7ee787",
      "#a5d6ff",
    ];
    let hash = 0;
    for (let i = 0; i < appName.length; i++) {
      hash = appName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // Determine color based on permission filter
  const getBlockColor = () => {
    if (permissionFilter === "storage") {
      // Color según tamaño: rojo (>1GB), amarillo (200MB-1GB), verde (<200MB)
      const size = app.installedSize || 0;
      if (size > 1_000_000_000) return "#f85149"; // Rojo para apps > 1GB
      if (size > 200_000_000) return "#ffa657"; // Amarillo para apps 200MB-1GB
      return "#3fb950"; // Verde para apps < 200MB
    } else if (permissionFilter) {
      // Amarillo/dorado para apps con permiso, azul celeste para apps sin permiso
      return hasPermission ? "#ffd700" : "#87ceeb";
    }
    return getAppColor(app.name);
  };

  const color = getBlockColor();

  // Animate between cube and grid layouts
  useFrame((_state, delta) => {
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
        THREE.MathUtils.lerp(
          currentPosition.current[0],
          targetPosition[0],
          delta * 4,
        ),
        THREE.MathUtils.lerp(
          currentPosition.current[1],
          targetPosition[1],
          delta * 4,
        ),
        THREE.MathUtils.lerp(
          currentPosition.current[2],
          targetPosition[2],
          delta * 4,
        ),
      ];

      meshRef.current.position.set(...currentPosition.current);

      // Gentle rotation when selected - keep rotation smooth
      if (isSelected) {
        baseRotation.current.y += delta * 0.8;
        baseRotation.current.x += delta * 0.3;
        meshRef.current.rotation.set(
          baseRotation.current.x,
          baseRotation.current.y,
          0,
        );
      } else {
        // Reset rotation smoothly when deselected
        baseRotation.current.x = THREE.MathUtils.lerp(
          baseRotation.current.x,
          0,
          delta * 5,
        );
        baseRotation.current.y = THREE.MathUtils.lerp(
          baseRotation.current.y,
          0,
          delta * 5,
        );
        meshRef.current.rotation.set(0, 0, 0);
      }
    }
  });

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: This is a 3D mesh object in Three.js, not a DOM element
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
        <lineBasicMaterial
          color={hovered || isSelected ? "#ffffff" : color}
          transparent
          opacity={0.6}
        />
      </lineSegments>
    </mesh>
  );
};

const CubeScene = ({
  installedApps,
  onAppSelect,
  isGridView,
  permissionFilter,
  selectedApp,
}: Omit<DataCubeProps, "loading" | "onPermissionFilterChange"> & {
  isGridView: boolean;
  permissionFilter: PermissionFilter;
  selectedApp: InstalledAppInfo | null;
}) => {
  // Verificar si la app tiene un permiso específico
  const hasPermission = (
    app: InstalledAppInfo,
    permission: PermissionFilter,
  ): boolean => {
    if (!permission) return false;
    if (!app.permissions) {
      console.log(`[DEBUG] App ${app.name} has no permissions array`);
      return false;
    }
    const result = app.permissions.includes(permission);
    console.log(
      `[DEBUG] App ${app.name} permissions:`,
      app.permissions,
      `Has ${permission}:`,
      result,
    );
    return result;
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
  // Cuando hay filtro de permisos, separar apps con/sin permisos en dos grupos
  const gridPositions: [number, number, number][] = [];
  let sortedApps = installedApps;

  if (permissionFilter && isGridView) {
    if (permissionFilter === "storage") {
      // Para el filtro storage, ordenar por tamaño instalado (de mayor a menor)
      sortedApps = [...installedApps].sort((a, b) => {
        const sizeA = a.installedSize || 0;
        const sizeB = b.installedSize || 0;
        return sizeB - sizeA; // Descendente: mayor a menor
      });
    } else {
      // Separar apps por permisos y crear un nuevo array ordenado
      const appsWithPermission = installedApps.filter((app) =>
        hasPermission(app, permissionFilter),
      );
      const appsWithoutPermission = installedApps.filter(
        (app) => !hasPermission(app, permissionFilter),
      );

      // Reordenar: primero las que tienen permiso, luego las que no
      sortedApps = [...appsWithPermission, ...appsWithoutPermission];
    }

    if (permissionFilter === "storage") {
      // Para storage, posicionar en una sola grilla continua de arriba hacia abajo
      const gridCols = Math.ceil(Math.sqrt(sortedApps.length));
      const gridRows = Math.ceil(sortedApps.length / gridCols);

      for (let i = 0; i < sortedApps.length; i++) {
        const col = i % gridCols;
        const row = Math.floor(i / gridCols);
        const posX = col - (gridCols - 1) / 2;
        const posY = (gridRows - 1) / 2 - row; // De arriba hacia abajo
        const posZ = 0;
        gridPositions.push([posX, posY, posZ]);
      }
    } else {
      // Para otros filtros (camera, files), separar en dos grupos
      const appsWithPermission = installedApps.filter((app) =>
        hasPermission(app, permissionFilter),
      );
      const appsWithoutPermission = installedApps.filter(
        (app) => !hasPermission(app, permissionFilter),
      );

      const withPermCols = Math.ceil(Math.sqrt(appsWithPermission.length));
      const withoutPermCols = Math.ceil(
        Math.sqrt(appsWithoutPermission.length),
      );
      const maxCols = Math.max(withPermCols, withoutPermCols, 5); // Mínimo 5 columnas

      // Calcular filas necesarias para cada grupo
      const withPermRows = Math.ceil(appsWithPermission.length / maxCols);

      // Espacio vertical entre grupos (fila vacía)
      const groupSeparation = 2.0;

      // Posicionar apps CON permisos (grupo superior, en amarillo)
      for (let i = 0; i < appsWithPermission.length; i++) {
        const col = i % maxCols;
        const row = Math.floor(i / maxCols);
        const posX = col - (maxCols - 1) / 2;
        const posY = withPermRows - row + groupSeparation / 2; // Grupo superior
        const posZ = 0;
        gridPositions.push([posX, posY, posZ]);
      }

      // Posicionar apps SIN permisos (grupo inferior, en azul celeste)
      for (let i = 0; i < appsWithoutPermission.length; i++) {
        const col = i % maxCols;
        const row = Math.floor(i / maxCols);
        const posX = col - (maxCols - 1) / 2;
        const posY = -(row + groupSeparation / 2); // Grupo inferior
        const posZ = 0;
        gridPositions.push([posX, posY, posZ]);
      }
    }
  } else {
    // Vista normal sin filtro
    const gridCols = Math.ceil(Math.sqrt(totalApps));
    const gridRows = Math.ceil(totalApps / gridCols);

    for (let i = 0; i < totalApps; i++) {
      const col = i % gridCols;
      const row = Math.floor(i / gridCols);
      const posX = col - (gridCols - 1) / 2;
      const posY = (gridRows - 1) / 2 - row; // Invert Y to start from top
      const posZ = 0; // All in the same Z plane
      gridPositions.push([posX, posY, posZ]);
    }
  }

  const handleBlockClick = (app: InstalledAppInfo) => {
    if (selectedApp?.instanceId === app.instanceId) {
      onAppSelect(null);
    } else {
      onAppSelect(app);
    }
  };

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={1.2} color="#58a6ff" />
      <pointLight position={[-10, -10, -10]} intensity={0.8} color="#f85149" />
      <pointLight position={[0, 15, 0]} intensity={0.9} color="#ffffff" />
      <pointLight position={[0, -10, 10]} intensity={0.6} color="#3fb950" />

      {/* Render app blocks */}
      {sortedApps.map((app, sortedIndex) => (
        <AppBlock
          key={app.instanceId}
          cubePosition={cubePositions[sortedIndex]}
          gridPosition={gridPositions[sortedIndex]}
          app={app}
          isSelected={selectedApp?.instanceId === app.instanceId}
          onClick={() => handleBlockClick(app)}
          isGridView={isGridView}
          hasPermission={hasPermission(app, permissionFilter)}
          permissionFilter={permissionFilter}
        />
      ))}

      {/* Large wireframe box outline around the entire cube - only show in cube mode */}
      {!isGridView && (
        <lineSegments>
          <edgesGeometry
            args={[new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize)]}
          />
          <lineBasicMaterial
            color="#30363d"
            transparent
            opacity={0.5}
            linewidth={2}
          />
        </lineSegments>
      )}

      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={cubeSize * 2}
        maxDistance={cubeSize * 5}
        autoRotate={!selectedApp}
        autoRotateSpeed={0.5}
        makeDefault
      />
    </>
  );
};

export const DataCube = ({
  installedApps,
  loading,
  onAppSelect,
  onPermissionFilterChange,
  selectedApp,
}: DataCubeProps) => {
  const { t } = useTranslation();
  const [isGridView, setIsGridView] = useState(false);
  const [permissionFilter, setPermissionFilter] =
    useState<PermissionFilter>(null);

  // Cambiar automáticamente a vista grid cuando se activa un filtro
  const handlePermissionFilterChange = (filter: PermissionFilter) => {
    if (filter !== null) {
      setIsGridView(true);
      // Limpiar selección de app cuando se activa un filtro
      onAppSelect(null);
    }
    setPermissionFilter(filter);
    onPermissionFilterChange(filter);
  };

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
          {loading ? t("analytics.loading") : t("analytics.noApps")}
        </Typography>
      </Box>
    );
  }

  const cubeSize = Math.ceil(Math.cbrt(installedApps.length));
  const cameraDistance = cubeSize * 3.5;

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        position: "absolute",
        top: 0,
        left: 0,
      }}
    >
      <Canvas
        camera={{
          position: [cameraDistance, cameraDistance, cameraDistance],
          fov: 50,
        }}
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
            },
          });
        }}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          touchAction: "none",
        }}
      >
        <CubeScene
          installedApps={installedApps}
          onAppSelect={onAppSelect}
          isGridView={isGridView}
          permissionFilter={permissionFilter}
          selectedApp={selectedApp}
        />
      </Canvas>

      {/* Toggle View Button & Permission Filters */}
      <Box
        sx={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <Tooltip
          title={
            permissionFilter
              ? t("analytics.disableFilterToSwitch")
              : isGridView
                ? t("analytics.viewCube")
                : t("analytics.viewGrid")
          }
          placement="right"
        >
          <span>
            <IconButton
              onClick={() => !permissionFilter && setIsGridView(!isGridView)}
              disabled={permissionFilter !== null}
              sx={{
                bgcolor: "rgba(22, 27, 34, 0.95)",
                border: "1px solid #30363d",
                color: permissionFilter ? "#8b949e" : "#58a6ff",
                backdropFilter: "blur(10px)",
                "&:hover": {
                  bgcolor: permissionFilter
                    ? "rgba(22, 27, 34, 0.95)"
                    : "rgba(88, 166, 255, 0.1)",
                  borderColor: permissionFilter ? "#30363d" : "#58a6ff",
                },
                cursor: permissionFilter ? "not-allowed" : "pointer",
              }}
            >
              {isGridView ? <ViewInArIcon /> : <AppsIcon />}
            </IconButton>
          </span>
        </Tooltip>

        {/* Permission Filter Badges */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            bgcolor: "rgba(22, 27, 34, 0.95)",
            border: "1px solid #30363d",
            borderRadius: 1,
            p: 1.5,
            backdropFilter: "blur(10px)",
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: "#8b949e",
              fontFamily: "monospace",
              textTransform: "uppercase",
              fontSize: "0.65rem",
              fontWeight: 700,
              mb: 0.5,
            }}
          >
            {t("analytics.permissions")}
          </Typography>
          <Chip
            icon={<StorageIcon />}
            label={t("analytics.storage")}
            onClick={() =>
              handlePermissionFilterChange(
                permissionFilter === "storage" ? null : "storage",
              )
            }
            sx={{
              bgcolor:
                permissionFilter === "storage"
                  ? "rgba(88, 166, 255, 0.2)"
                  : "transparent",
              border: `1px solid ${permissionFilter === "storage" ? "#58a6ff" : "#30363d"}`,
              color: permissionFilter === "storage" ? "#58a6ff" : "#8b949e",
              fontFamily: "monospace",
              fontSize: "0.7rem",
              height: "28px",
              cursor: "pointer",
              transition: "all 0.2s",
              "&:hover": {
                bgcolor: "rgba(88, 166, 255, 0.1)",
                borderColor: "#58a6ff",
                color: "#58a6ff",
              },
              "& .MuiChip-icon": {
                color: permissionFilter === "storage" ? "#58a6ff" : "#8b949e",
                fontSize: "1rem",
              },
            }}
          />
          <Chip
            icon={<CameraAltIcon />}
            label={t("analytics.camera")}
            onClick={() =>
              handlePermissionFilterChange(
                permissionFilter === "camera" ? null : "camera",
              )
            }
            sx={{
              bgcolor:
                permissionFilter === "camera"
                  ? "rgba(88, 166, 255, 0.2)"
                  : "transparent",
              border: `1px solid ${permissionFilter === "camera" ? "#58a6ff" : "#30363d"}`,
              color: permissionFilter === "camera" ? "#58a6ff" : "#8b949e",
              fontFamily: "monospace",
              fontSize: "0.7rem",
              height: "28px",
              cursor: "pointer",
              transition: "all 0.2s",
              "&:hover": {
                bgcolor: "rgba(88, 166, 255, 0.1)",
                borderColor: "#58a6ff",
                color: "#58a6ff",
              },
              "& .MuiChip-icon": {
                color: permissionFilter === "camera" ? "#58a6ff" : "#8b949e",
                fontSize: "1rem",
              },
            }}
          />
          <Chip
            icon={<FolderIcon />}
            label={t("analytics.files")}
            onClick={() =>
              handlePermissionFilterChange(
                permissionFilter === "files" ? null : "files",
              )
            }
            sx={{
              bgcolor:
                permissionFilter === "files"
                  ? "rgba(88, 166, 255, 0.2)"
                  : "transparent",
              border: `1px solid ${permissionFilter === "files" ? "#58a6ff" : "#30363d"}`,
              color: permissionFilter === "files" ? "#58a6ff" : "#8b949e",
              fontFamily: "monospace",
              fontSize: "0.7rem",
              height: "28px",
              cursor: "pointer",
              transition: "all 0.2s",
              "&:hover": {
                bgcolor: "rgba(88, 166, 255, 0.1)",
                borderColor: "#58a6ff",
                color: "#58a6ff",
              },
              "& .MuiChip-icon": {
                color: permissionFilter === "files" ? "#58a6ff" : "#8b949e",
                fontSize: "1rem",
              },
            }}
          />
        </Box>
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
          {t("analytics.dataCube")}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: "#c9d1d9",
            fontFamily: "monospace",
            fontSize: "0.75rem",
          }}
        >
          •{" "}
          {t("analytics.terminal.totalInstalled", {
            count: installedApps.length,
          })}
          <br />• {t("analytics.cubeSize")}: {cubeSize}×{cubeSize}×{cubeSize}
          <br />
          <br />
          <span style={{ color: "#8b949e" }}>{t("analytics.controls")}:</span>
          <br />• {t("analytics.clickToSelect")}
          <br />• {t("analytics.dragToRotate")}
          <br />• {t("analytics.scrollToZoom")}
        </Typography>
      </Box>
    </Box>
  );
};
