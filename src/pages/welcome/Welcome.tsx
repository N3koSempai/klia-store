import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { completeSetup } from "../../hooks/useCompleteSetup";
import "./Welcome.css";

interface WelcomeProps {
  onComplete: () => void;
}

export function Welcome({ onComplete }: WelcomeProps) {
  const { t } = useTranslation();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);

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

  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentSlide < slides.length - 1) {
        setCurrentSlide(currentSlide + 1);
      }
    }, 5000); // 5 seconds per slide

    return () => clearTimeout(timer);
  }, [currentSlide]);

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

  const handleAccept = async () => {
    await handleComplete();
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
          {currentSlide < slides.length - 1 && (
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
            onClick={handleAccept}
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
