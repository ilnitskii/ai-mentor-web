import { useEffect, useState } from "react";

import type { BackendServices } from "../data/backendServices";
import { course as bundledCourse, isSupportedCourse } from "./course";
import type { Course } from "./types";

export function useCourse(services: BackendServices): Course {
  const [activeCourse, setActiveCourse] = useState<Course>(bundledCourse);

  useEffect(() => {
    let active = true;
    const cacheKey = `course:${bundledCourse.track_id}`;

    void services.offline.getContent(cacheKey).then((cached) => {
      if (active && isSupportedCourse(cached)) setActiveCourse(cached);
    });
    void services.database
      .getPublishedCourse(bundledCourse.track_id)
      .then(async (release) => {
        if (!release || !isSupportedCourse(release.content)) return;
        if (active) setActiveCourse(release.content);
        await services.offline.putContent(cacheKey, release.content);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [services.database, services.offline]);

  return activeCourse;
}
