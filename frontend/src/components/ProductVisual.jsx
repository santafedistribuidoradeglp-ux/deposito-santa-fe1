export const ProductVisual = ({ visual, name, size = "md" }) => {
  const brand = name?.split(" ").pop() || "";
  const scale = size === "lg" ? "scale-125" : "";

  if (visual?.startsWith("gas")) {
    return (
      <div className={`pv-wrap pv-gold ${scale}`} aria-hidden="true">
        <div className="gas-cylinder">
          <div className="gas-handle" />
          <div className="gas-label">S</div>
          <div className="gas-base" />
        </div>
      </div>
    );
  }
  if (visual?.startsWith("water")) {
    return (
      <div className={`pv-wrap ${visual === "water-light" ? "pv-light" : "pv-blue"} ${scale}`} aria-hidden="true">
        <div className="water-jug">
          <div className="jug-cap" />
          <div className="jug-neck" />
          <div className="jug-body"><span>{brand}</span></div>
        </div>
      </div>
    );
  }
  return null;
};
