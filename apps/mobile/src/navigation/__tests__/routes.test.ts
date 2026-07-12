import { matchPath, routeDefinitions } from '../routes';

const projectParams = { projectId: 'project-123' };

describe('explicit route registry', () => {
  it.each([
    ['ProjectSkills', './skills/new', '/projects/project-123/settings/skills/new'],
    ['ProjectPrompts', './prompts/template-1', '/projects/project-123/settings/prompts/template-1'],
    ['ProjectPackages', './packages/install', '/projects/project-123/settings/packages/install'],
  ])('uses the settings base for relative navigation from %s', (routeName, relativePath, target) => {
    const definition = routeDefinitions.find((item) => item.name === routeName);

    expect(definition).toBeDefined();
    expect(`${definition?.relativeBase(projectParams)}/${relativePath.replace(/^\.\//, '')}`).toBe(target);
    expect(matchPath(target)?.definition.name).toBeDefined();
  });
});
