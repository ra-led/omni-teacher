'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

import { MermaidDiagram } from './MermaidDiagram';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      className="markdown-body"
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, rehypeKatex]}
      components={{
        code(componentProps) {
          const { inline, className, children, ...props } = componentProps as {
            inline?: boolean;
            className?: string;
            children: React.ReactNode;
          } & React.HTMLAttributes<HTMLElement>;
          const match = /language-(\w+)/.exec(className ?? '');
          const language = match?.[1];
          if (!inline && language === 'mermaid') {
            return <MermaidDiagram chart={String(children).trim()} />;
          }
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
