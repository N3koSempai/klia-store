import { lazy, Suspense } from "react";

const DotLottieReact = lazy(() =>
	import("@lottiefiles/dotlottie-react").then((m) => ({
		default: m.DotLottieReact,
	})),
);

interface LazyLottieProps {
	src: string;
	loop?: boolean;
	autoplay?: boolean;
}

export const LazyLottie = (props: LazyLottieProps) => (
	<Suspense fallback={null}>
		<DotLottieReact {...props} />
	</Suspense>
);
