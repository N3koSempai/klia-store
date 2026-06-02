import {
	FormControl,
	FormControlLabel,
	MenuItem,
	Select,
	Switch,
	Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { completeSetup } from "../../hooks/useCompleteSetup";
import {
	type ColorBlindMode,
	useAccessibilityStore,
} from "../../store/accessibilityStore";
import "./Welcome.css";

interface WelcomeProps {
	onComplete: () => void;
}

export function Welcome({ onComplete }: WelcomeProps) {
	const { t } = useTranslation();
	const [currentSlide, setCurrentSlide] = useState(0);
	const [isCompleting, setIsCompleting] = useState(false);

	const { colorBlindMode, reducedMotion, highContrast, setColorBlindMode, setReducedMotion, setHighContrast } =
		useAccessibilityStore();

	const slides = [
		{
			id: 1,
			title: t("welcome.slide1.title"),
			description: t("welcome.slide1.description"),
		},
		{
			id: 2,
			title: t("welcome.slide2.title"),
			description: t("welcome.slide2.description"),
		},
		{
			id: 3,
			title: t("welcome.slide3.title"),
			description: t("welcome.slide3.description"),
		},
		{
			id: 4,
			title: t("welcome.slide4.title"),
			description: t("welcome.slide4.description"),
		},
		{
			id: 5,
			title: t("welcome.slide5.title"),
			description: t("welcome.slide5.description"),
		},
	];

	const isLastSlide = currentSlide === slides.length - 1;

	// biome-ignore lint/correctness/useExhaustiveDependencies: slides.length is constant; adding slides array would cause unnecessary re-runs
	useEffect(() => {
		if (isLastSlide) return;
		const timer = setTimeout(() => {
			setCurrentSlide(currentSlide + 1);
		}, 5000);
		return () => clearTimeout(timer);
	}, [currentSlide, isLastSlide]);

	const handleComplete = async () => {
		setIsCompleting(true);
		try {
			await completeSetup();
			onComplete();
		} catch (err) {
			console.error("Failed to complete setup:", err);
			setIsCompleting(false);
		}
	};

	const handleSkip = () => {
		if (currentSlide < slides.length - 1) {
			setCurrentSlide(currentSlide + 1);
		}
	};

	const handleIndicatorClick = (index: number) => {
		setCurrentSlide(index);
	};

	const renderDescription = (description: string, slideId: number) => {
		if (slideId === 2) {
			return (
				<p className="slide-description">
					{description}{" "}
					<span className="highlight-localfirst">#localfirst</span>
				</p>
			);
		}
		if (slideId === 3) {
			const parts = description.split("NekoSempai");
			return (
				<p className="slide-description">
					{parts[0]}
					<a
						href="https://github.com/N3koSempai"
						className="github-link"
						onClick={(e) => {
							e.preventDefault();
							window.open("https://github.com/N3koSempai", "_blank");
						}}
					>
						@NekoSempai
					</a>
					{parts[1]}
				</p>
			);
		}
		return <p className="slide-description">{description}</p>;
	};

	return (
		<div className="welcome-container">
			<div className="welcome-content">
				<div className="slide-content">
					<h1 className="slide-title">{slides[currentSlide].title}</h1>
					{renderDescription(
						slides[currentSlide].description,
						slides[currentSlide].id,
					)}
				</div>

				{isLastSlide && (
					<div className="accessibility-panel">
						<Typography className="a11y-panel-title">
							{t("welcome.accessibility.title")}
						</Typography>
						<Typography className="a11y-panel-subtitle">
							{t("welcome.accessibility.subtitle")}
						</Typography>

						<div className="a11y-toggles">
							<FormControlLabel
								control={
									<Switch
										checked={reducedMotion}
										onChange={(e) => setReducedMotion(e.target.checked)}
										color="primary"
									/>
								}
								label={
									<span>
										<span className="a11y-toggle-label">{t("welcome.accessibility.reducedMotion")}</span>
										<span className="a11y-toggle-desc">{t("welcome.accessibility.reducedMotionDesc")}</span>
									</span>
								}
							/>

							<FormControlLabel
								control={
									<Switch
										checked={highContrast}
										onChange={(e) => setHighContrast(e.target.checked)}
										color="primary"
									/>
								}
								label={
									<span>
										<span className="a11y-toggle-label">{t("welcome.accessibility.highContrast")}</span>
										<span className="a11y-toggle-desc">{t("welcome.accessibility.highContrastDesc")}</span>
									</span>
								}
							/>

							<div className="a11y-select-row">
								<span>
									<span className="a11y-toggle-label">{t("welcome.accessibility.colorBlind")}</span>
									<span className="a11y-toggle-desc">{t("welcome.accessibility.colorBlindDesc")}</span>
								</span>
								<FormControl size="small" sx={{ minWidth: 200 }}>
									<Select
										value={colorBlindMode}
										onChange={(e) => setColorBlindMode(e.target.value as ColorBlindMode)}
										inputProps={{ "aria-label": t("welcome.accessibility.colorBlind") }}
										sx={{
											color: "white",
											backgroundColor: "rgba(255,255,255,0.1)",
											"& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.3)" },
											"& .MuiSvgIcon-root": { color: "white" },
										}}
									>
										<MenuItem value="none">{t("welcome.accessibility.colorBlindNone")}</MenuItem>
										<MenuItem value="deuteranopia">{t("welcome.accessibility.colorBlindDeuteranopia")}</MenuItem>
										<MenuItem value="protanopia">{t("welcome.accessibility.colorBlindProtanopia")}</MenuItem>
										<MenuItem value="tritanopia">{t("welcome.accessibility.colorBlindTritanopia")}</MenuItem>
									</Select>
								</FormControl>
							</div>
						</div>
					</div>
				)}

				<div className="slide-indicators">
					{slides.map((slide, index) => (
						<button
							key={slide.id}
							type="button"
							onClick={() => handleIndicatorClick(index)}
							className={`indicator ${index === currentSlide ? "active" : ""}`}
							aria-label={t("welcome.goToSlide", { index: index + 1 })}
						/>
					))}
				</div>

				<div className="welcome-actions">
					{!isLastSlide && (
						<button
							type="button"
							onClick={handleSkip}
							className="btn-skip"
							disabled={isCompleting}
						>
							{t("welcome.skip")}
						</button>
					)}
					<button
						type="button"
						onClick={handleComplete}
						className="btn-accept"
						disabled={isCompleting}
					>
						{isCompleting ? t("welcome.settingUp") : t("welcome.getStarted")}
					</button>
				</div>
			</div>
		</div>
	);
}
