import { createContext, useContext, useState, useLayoutEffect, type ReactNode } from "react";

interface PageHeaderCtx {
  node: ReactNode;
  setNode: (n: ReactNode) => void;
}

const PageHeaderContext = createContext<PageHeaderCtx>({ node: null, setNode: () => {} });

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<ReactNode>(null);
  return (
    <PageHeaderContext.Provider value={{ node, setNode }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeaderSlot(): ReactNode {
  return useContext(PageHeaderContext).node;
}

// Call inside a page component to mount content into the titlebar.
// Uses useLayoutEffect so the header is set before the first paint.
export function useSetPageHeader(content: ReactNode, deps: unknown[]) {
  const { setNode } = useContext(PageHeaderContext);
  useLayoutEffect(() => {
    setNode(content);
    return () => setNode(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
