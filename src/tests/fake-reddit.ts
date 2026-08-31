import type {
  CreatedComment,
  CreatedPost,
  RedditLike,
  SubmitCommentOptions,
  SubmitPostOptions,
} from '../server/core/reddit-port.ts';

export type RecordedComment = {
  readonly id: string;
  readonly parentId: string;
  readonly text: string;
  readonly runAs: 'USER' | 'APP';
  sticky: boolean;
  distinguished: boolean;
};

export type RecordedPost = SubmitPostOptions & { readonly id: string };

/** In-memory Reddit, recording exactly what the app tried to publish. */
export class FakeReddit implements RedditLike {
  readonly posts: RecordedPost[] = [];
  readonly comments: RecordedComment[] = [];

  failNextPost = false;
  failNextComment = false;

  private counter = 0;

  async submitCustomPost(options: SubmitPostOptions): Promise<CreatedPost> {
    await Promise.resolve();
    if (this.failNextPost) {
      this.failNextPost = false;
      throw new Error('reddit is having a day');
    }
    const id = `t3_post${this.counter++}`;
    this.posts.push({ ...options, id });
    return { id };
  }

  async submitComment(options: SubmitCommentOptions): Promise<CreatedComment> {
    await Promise.resolve();
    if (this.failNextComment) {
      this.failNextComment = false;
      throw new Error('comment rejected');
    }
    const id = `t1_c${this.counter++}`;
    const record: RecordedComment = {
      id,
      parentId: options.id,
      text: options.text,
      runAs: options.runAs,
      sticky: false,
      distinguished: false,
    };
    this.comments.push(record);

    return {
      id,
      permalink: `https://reddit.com/comments/x/_/${id}/`,
      distinguish: async (makeSticky?: boolean): Promise<void> => {
        await Promise.resolve();
        record.distinguished = true;
        record.sticky = makeSticky === true;
      },
    };
  }
}
