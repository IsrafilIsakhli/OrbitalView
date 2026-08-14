export function NewsLoadingState() {
  return <div aria-busy className="space-news-loading">{Array.from({ length: 7 }, (_, index) => <span key={index} />)}</div>;
}
