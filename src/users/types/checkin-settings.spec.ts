import { describe, it, expect } from "@jest/globals";
import { validateCheckinSettings } from './checkin-settings';
const morning = { id: 'morning', title: null, icon: 'partly-sunny-outline', deleted: false, questions: [{id:'extraNotes',text:null}], metricIds:['energy','mentalClarity'] };
const config = (template = morning) => ({version:1,templates:[template]});
describe('check-in settings', () => {
  it('accepts configurable final prompt and builtin deletion without losing its definition', () => {
    expect(validateCheckinSettings(config({...morning,deleted:true}))).toEqual(config({...morning,deleted:true}));
  });
  it('accepts a custom check-in and selected icon', () => {
    const value={...morning,id:'custom:12345678-1234-4123-8123-123456789abc',title:'Practice',questions:[{id:'q',text:'What changed?'}]};
    expect(validateCheckinSettings(config(value as any))).toEqual(config(value as any));
  });
  it.each([
    {...morning,id:'unknown'}, {...morning,id:'daily'}, {...morning,id:'photoMoment'}, {...morning,icon:'arbitrary-icon'}, {...morning,metricIds:['unknown']},
    {...morning,questions:[{id:'invented',text:null}]}, {...morning,metricIds:['energy','energy']},
    {...morning,questions:[{id:'q',text:'A'},{id:'q',text:'B'}]},
  ])('rejects invalid identities, icons, metrics or question snapshots', (template) => {
    expect(()=>validateCheckinSettings(config(template as any))).toThrow();
  });
});

describe('custom check-in icons', () => {
 it.each(['mono:Я', 'mono:МП', 'mono:AB', 'mono:Ł', 'briefcase-outline', 'people-outline', 'map-outline'])('preserves %s through validation', icon => {
  const value = config({...morning, icon});
  expect(validateCheckinSettings(value)).toEqual(value);
 });
 it.each(['mono:', 'mono:ABC', 'mono:1', 'mono:🙂', 'mono:A B', 'mono:<', 'state:brain', null, 5])('rejects invalid icon %s', icon => {
  expect(() => validateCheckinSettings(config({...morning, icon} as any))).toThrow();
 });
});
