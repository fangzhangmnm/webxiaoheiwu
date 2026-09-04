export declare function safeAreaTop(): number;
interface PositionOpts {
    anchor?: HTMLElement | null;
    align?: "left" | "right";
    offsetY?: number;
    edgeMargin?: number;
    clampViewport?: boolean;
}
export declare function positionPopup(popupEl: HTMLElement | null, opts?: PositionOpts): void;
export {};
