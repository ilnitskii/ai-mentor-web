import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function LessonRenderer({ body }: { body: string }) {
  return (
    <div className="lesson-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {body}
      </ReactMarkdown>
    </div>
  );
}
