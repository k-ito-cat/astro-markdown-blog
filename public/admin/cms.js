import CMS from "decap-cms-app";
import "src/styles/global.css";

const PostPreview = ({ entry }) => {
  const body = entry.getIn(["data", "body"]);

  return `
    <article class="prose text-secondary prose-p:mb-4 prose-h2:no-underline prose-h2:mt-8 prose-h3:mt-6 prose-h2:mb-4 prose-h3:text-[20px] prose-h2:text-primary prose-h2:lg:text-heading-second prose-h3:mb-4 prose-ul:pl-6 prose-ul:mb-4 prose-ul:list-disc prose-pre:bg-code prose-pre:p-4 prose-pre:my-4 prose-pre:rounded-md prose-pre:overflow-x-auto prose-code:font-code prose-code:text-[0.9rem] prose-code:text-code prose-a:no-underline prose-a:font-medium prose-a:transition-colors prose-a:duration-300 prose-a:ease-in-out prose-a:text-link prose-a:hover:underline prose-a:hover:text-link-hover prose-strong:text-primary prose-img:w-[80%] prose-img:mx-auto prose-blockquote:text-secondary prose-li:marker:text-secondary prose-code:py-1 prose-code:rounded-b-sm prose-code:bg-code prose-h3:text-primary prose-h3:lg:text-heading-third prose-a:break-words prose-code:px-2 prose-h2:text-[24px] w-full max-w-full">
      ${body}
    </article>
  `;
};

CMS.registerPreviewTemplate("blog", PostPreview);
