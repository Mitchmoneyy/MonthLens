import { describe, expect, it } from 'vitest';
import { creatorInsights, creatorStats, newCreator, newPost, postsFromCsv, readProfileText, rosterLabels, SAMPLE_CREATORS } from '../creators';

describe('creator stats', () => {
  const maya = SAMPLE_CREATORS[0];
  const s = creatorStats(maya);
  it('counts, totals, average, median', () => {
    expect(s.posts).toBe(6);
    expect(s.totalViews).toBe(18400 + 9100 + 142000 + 12600 + 21300 + 15800);
    expect(s.avgViews).toBeCloseTo(s.totalViews! / 6, 6);
    expect(s.medianViews).toBe((15800 + 18400) / 2);
  });
  it('best and weakest post', () => {
    expect(s.best!.title).toBe('Rain test');
    expect(s.worst!.title).toBe('3 ways to pack it');
  });
  it('cost per 1,000 views from per-post pay', () => {
    expect(s.paid).toBe(350 * 6);
    expect(s.costPer1k).toBeCloseTo((2100 / s.totalViews!) * 1000, 6);
  });
  it('per-month pay counts months covered', () => {
    const jordan = creatorStats(SAMPLE_CREATORS[1]);
    expect(jordan.paid).toBe(1800);
  });
  it('flags a post that carries the average', () => {
    expect(creatorInsights(maya, s).join(' ')).toMatch(/carrying the average/);
  });
  it('labels across the roster', () => {
    const list = SAMPLE_CREATORS.map((c) => ({ c, s: creatorStats(c) }));
    const l = rosterLabels(list);
    expect(l['sample-maya']).toContain('Best single post');
    expect(Object.values(l).flat()).toContain('Cheapest views');
  });
  it('no posts: nothing invented', () => {
    const e = creatorStats(newCreator());
    expect(e.avgViews).toBeNull();
    expect(e.best).toBeNull();
    expect(e.costPer1k).toBeNull();
  });
  it('missing engagement stays missing', () => {
    const c = { ...newCreator(), posts: [newPost({ views: 1000 })] };
    expect(creatorStats(c).engagement).toBeNull();
  });
});

describe('reading profiles', () => {
  it('TikTok profile screenshot text', () => {
    const r = readProfileText('TikTok\n@maya.makes\n312\nFollowing\n48.2K\nFollowers\n1.4M\nLikes\nVideos\n18.4K\n9,108\n142K\n12.6K');
    expect(r.platform).toBe('TikTok');
    expect(r.handle).toBe('maya.makes');
    expect(r.followers).toBe(48200);
    expect(r.gridViews).toEqual([18400, 9108, 142000, 12600]);
  });
  it('real OCR layout: numbers row over labels row, grid tiles side by side', () => {
    const r = readProfileText('TikTok\n@rivera.reviews\n210 63.5K 1.1M\nFollowing ~~ Followers Likes\n24.1K 8,902 311K\n');
    expect(r.followers).toBe(63500);
    expect(r.gridViews).toEqual([24100, 8902, 311000]);
  });
  it('Instagram header on one line', () => {
    const r = readProfileText('jordanreviews\n640 posts 126K followers 410 following\nReels');
    expect(r.followers).toBe(126000);
    expect(r.profilePosts).toBe(640);
    expect(r.platform).toBe('Instagram');
  });
});

describe('post exports', () => {
  it('TikTok-style export', () => {
    const posts = postsFromCsv('Video title,Post time,Total views,Total likes,Total comments,Total shares\nRain test,2026-10-11 18:02,142000,9800,620,1900\nGift guide,2026-10-24 09:15,"21,300",1510,102,180\n');
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({ title: 'Rain test', date: '2026-10-11', views: 142000, likes: 9800, shares: 1900 });
    expect(posts[1].views).toBe(21300);
  });
  it('Instagram-style export with saves', () => {
    const posts = postsFromCsv('Description,Publish time,Views,Likes,Comments,Shares,Saves,Permalink\nHonest review,10/03/2026,22100,610,40,22,95,https://instagram.com/p/x\n');
    expect(posts[0]).toMatchObject({ views: 22100, saves: 95, url: 'https://instagram.com/p/x' });
  });
  it('no views column: nothing', () => expect(postsFromCsv('Title,Likes\nA,10\n')).toEqual([]));
});
