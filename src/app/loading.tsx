export default function Loading() {
  return (
    <div className="global-loading" role="status" aria-live="polite" aria-label="页面加载中">
      <div className="global-loading__content">
        <div className="global-loading__spinner" />
        <div className="global-loading__text">正在加载工作台...</div>
      </div>
    </div>
  );
}
